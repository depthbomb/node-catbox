import { openAsBlob } from 'node:fs';
import EventEmitter from 'node:events';
import { resolve, basename } from 'node:path';
import {
	LITTERBOX_API_ENDPOINT,
	LITTERBOX_REQUEST_TIMEOUT_MS,
	LITTERBOX_MAX_FILE_BYTES
} from '../constants';
import {
	isValidFile,
	runWithCleanup,
	streamToBlobWithSizeLimit,
	assertFileSizeWithinLimit
} from '../utils';
import { postForm, validateRequestTimeout } from '../request';
import type { RequestSnapshot, ResponseSnapshot } from '../utils';
import type { ClientOptions } from '../request';

type LitterboxEvents = {
	uploadingFile:   [filepath: string, duration: typeof acceptedDurations[number] | FileLifetime];
	uploadingStream: [filename: string, duration: typeof acceptedDurations[number] | FileLifetime];

	request:  [request: RequestSnapshot];
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
	stream: ReadableStream<unknown> | AsyncIterable<unknown>;
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

export enum FileLifetime {
	OneHour     = '1h',
	TwelveHours = '12h',
	OneDay      = '24h',
	ThreeDays   = '72h',
}

export enum FileNameLength {
	Six = 6,
	Sixteen = 16
}

const acceptedFileNameLengths = [FileNameLength.Six, FileNameLength.Sixteen] as const;

export class Litterbox extends EventEmitter<LitterboxEvents> {
	readonly #requestTimeoutMs: number;

	public constructor({ requestTimeoutMs = LITTERBOX_REQUEST_TIMEOUT_MS }: ClientOptions = {}) {
		super();
		validateRequestTimeout(requestTimeoutMs);
		this.#requestTimeoutMs = requestTimeoutMs;
	}

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
		data.set('fileNameLength', String(fileNameLength));

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
		return runWithCleanup(async () => {
			const data = new FormData();
			data.set('reqtype', 'fileupload');
			data.set('fileToUpload', file, filename);
			data.set('time', duration);
			data.set('fileNameLength', String(fileNameLength));

			this.emit('uploadingStream', filename, duration);

			const res = await this.#doRequest(data);
			if (res.startsWith('https://litter.catbox.moe/')) {
				return res;
			} else {
				throw new Error(res);
			}
		}, cleanup);
	}

	#assertValidDuration(duration: unknown): asserts duration is typeof acceptedDurations[number] {
		if (typeof duration !== 'string' || !acceptedDurations.includes(duration as typeof acceptedDurations[number])) {
			throw new Error(`Invalid duration "${duration}", accepted values are ${acceptedDurations.join(', ')}`);
		}
	}

	#assertValidFileNameLength(fileNameLength: unknown): asserts fileNameLength is typeof acceptedFileNameLengths[number] {
		if (typeof fileNameLength !== 'number' || !acceptedFileNameLengths.includes(fileNameLength as typeof acceptedFileNameLengths[number])) {
			throw new Error(`Invalid file name length "${fileNameLength}", accepted values are ${acceptedFileNameLengths.join(', ')}`);
		}
	}

	async #doRequest(data: FormData) {
		return postForm({
			endpoint: LITTERBOX_API_ENDPOINT,
			data,
			timeoutMs: this.#requestTimeoutMs,
			onRequest: request => this.emit('request', request),
			onResponse: response => this.emit('response', response)
		});
	}
}
