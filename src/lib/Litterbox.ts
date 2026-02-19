import { openAsBlob } from 'node:fs';
import EventEmitter from 'node:events';
import { resolve, basename } from 'node:path';
import {
	USER_AGENT,
	RETRY_DELAY_MS,
	REQUEST_TIMEOUT_MS,
	MAX_REQUEST_RETRIES,
	LITTERBOX_API_ENDPOINT,
	LITTERBOX_MAX_FILE_BYTES
} from '../constants';
import {
	isValidFile,
	createResponseSnapshot,
	streamToBlobWithSizeLimit,
	assertFileSizeWithinLimit
} from '../utils';
import type { ResponseSnapshot } from '../utils';

type LitterboxEvents = {
	uploadingFile:   [filepath: string, duration: typeof acceptedDurations[number] | FileLifetime];
	uploadingStream: [filename: string, duration: typeof acceptedDurations[number] | FileLifetime];

	request:  [requestInit: RequestInit];
	response: [response: ResponseSnapshot];
};

type UploadFileOptions = {
	/**
	 * Path to the file to upload.
	 */
	path: string;
	/**
	 * Duration before the file is deleted, defaults to `1h`.
	 */
	duration?: typeof acceptedDurations[number] | FileLifetime;
	/**
	 * The length of the randomized file name.
	 */
	fileNameLength?: FileNameLength;
	/**
	 * Maximum file size in bytes before throwing, defaults to 1 GB.
	 */
	maxFileBytes?: number;
};

type UploadFileStreamOptions = {
	stream: ReadableStream | AsyncIterable<any>;
	filename: string;
	/**
	 * Duration before the file is deleted, defaults to `1h`.
	 */
	duration?: typeof acceptedDurations[number] | FileLifetime;
	/**
	 * The length of the randomized file name.
	 */
	fileNameLength?: FileNameLength;
	/**
	 * Maximum stream size in bytes before throwing, defaults to 1 GB.
	 */
	maxStreamBytes?: number;
};

export const acceptedDurations = ['1h', '12h', '24h', '72h'] as const;

export const enum FileLifetime {
	OneHour     = '1h',
	TwelveHours = '12h',
	OneDay      = '24h',
	ThreeDays   = '72h',
}

export const enum FileNameLength {
	Six = 6,
	Sixteen = 16
}

const acceptedFileNameLengths = [FileNameLength.Six, FileNameLength.Sixteen] as const;

export class Litterbox extends EventEmitter<LitterboxEvents> {
	/**
	 * Uploads a file temporarily to Litterbox
	 * @param options Options
	 * @returns The uploaded file URL
	 */
	public async uploadFile({ path, duration = FileLifetime.OneHour, fileNameLength = FileNameLength.Six, maxFileBytes = LITTERBOX_MAX_FILE_BYTES }: UploadFileOptions) {
		path = resolve(path);

		if (!await isValidFile(path)) {
			throw new Error(`Invalid file path "${path}"`);
		}

		this.#assertValidDuration(duration);
		this.#assertValidFileNameLength(fileNameLength);
		await assertFileSizeWithinLimit(path, maxFileBytes);

		const file = await openAsBlob(path);
		const data = new FormData();
		data.set('reqtype', 'fileupload');
		data.set('fileToUpload', file, basename(path));
		data.set('time', duration);
		data.set('fileNameLength', fileNameLength);

		this.emit('uploadingFile', path, duration);

		const res = await this.#doRequest(data);
		if (res.startsWith('https://litter.catbox.moe/')) {
			return res;
		} else {
			throw new Error(res);
		}
	}

	public async uploadFileStream({ stream, filename, duration = FileLifetime.OneHour, fileNameLength = FileNameLength.Six, maxStreamBytes = LITTERBOX_MAX_FILE_BYTES }: UploadFileStreamOptions) {
		this.#assertValidDuration(duration);
		this.#assertValidFileNameLength(fileNameLength);

		const { blob: file, cleanup } = await streamToBlobWithSizeLimit(stream, maxStreamBytes);
		try {
			const data = new FormData();
			data.set('reqtype', 'fileupload');
			data.set('fileToUpload', file, filename);
			data.set('time', duration);
			data.set('fileNameLength', fileNameLength);

			this.emit('uploadingStream', filename, duration);

			const res = await this.#doRequest(data);
			if (res.startsWith('https://litter.catbox.moe/')) {
				return res;
			} else {
				throw new Error(res);
			}
		} finally {
			await cleanup();
		}
	}

	#assertValidDuration(duration: any): asserts duration is typeof acceptedDurations[number] {
		if (!acceptedDurations.includes(duration)) {
			throw new Error(`Invalid duration "${duration}", accepted values are ${acceptedDurations.join(', ')}`);
		}
	}

	#assertValidFileNameLength(fileNameLength: any): asserts fileNameLength is typeof acceptedFileNameLengths[number] {
		if (!acceptedFileNameLengths.includes(fileNameLength)) {
			throw new Error(`Invalid file name length "${fileNameLength}", accepted values are ${acceptedFileNameLengths.join(', ')}`);
		}
	}

	async #doRequest(data: FormData) {
		for (let attempt = 0; attempt <= MAX_REQUEST_RETRIES; attempt++) {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
			try {
				const init: RequestInit = {
					method: 'POST',
					headers: {
						'user-agent': USER_AGENT
					},
					body: data,
					signal: controller.signal
				};

				this.emit('request', init);

				const res = await fetch(LITTERBOX_API_ENDPOINT, init);

				this.emit('response', createResponseSnapshot(res));

				if (this.#shouldRetryStatus(res.status) && attempt < MAX_REQUEST_RETRIES) {
					await this.#waitForRetry(attempt);
					continue;
				}

				return res.text();
			} catch (err) {
				if (this.#isAbortError(err)) {
					if (attempt < MAX_REQUEST_RETRIES) {
						await this.#waitForRetry(attempt);
						continue;
					}
					throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS} ms`);
				}

				if (attempt < MAX_REQUEST_RETRIES) {
					await this.#waitForRetry(attempt);
					continue;
				}

				throw err;
			} finally {
				clearTimeout(timeout);
			}
		}

		throw new Error('Request failed after retries');
	}

	#shouldRetryStatus(status: number) {
		return status === 408 || status === 425 || status === 429 || status >= 500;
	}

	#isAbortError(err: unknown) {
		return err instanceof DOMException && err.name === 'AbortError';
	}

	async #waitForRetry(attempt: number) {
		const delayMs = RETRY_DELAY_MS * (2 ** attempt);
		await new Promise(resolve => setTimeout(resolve, delayMs));
	}
}
