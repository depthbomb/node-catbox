import { openAsBlob } from 'node:fs';
import EventEmitter from 'node:events';
import { isValidFile } from '../utils';
import { blob } from 'node:stream/consumers';
import { resolve, basename } from 'node:path';
import { USER_AGENT, LITTERBOX_API_ENDPOINT } from '../constants';

type LitterboxEvents = {
	uploadingFile:   [filepath: string, duration: typeof acceptedDurations[number] | FileLifetime];
	uploadingStream: [filename: string, duration: typeof acceptedDurations[number] | FileLifetime];

	request:  [requestInit: RequestInit];
	response: [response: Response];
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

export class Litterbox extends EventEmitter<LitterboxEvents> {
	/**
	 * Uploads a file temporarily to Litterbox
	 * @param options Options
	 * @returns The uploaded file URL
	 */
	public async uploadFile({ path, duration = FileLifetime.OneHour, fileNameLength = FileNameLength.Six }: UploadFileOptions) {
		path = resolve(path);

		if (!await isValidFile(path)) {
			throw new Error(`Invalid file path "${path}"`);
		}

		this.#assertValidDuration(duration);

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

	public async uploadFileStream({ stream, filename, duration = FileLifetime.OneHour, fileNameLength = FileNameLength.Six }: UploadFileStreamOptions) {
		this.#assertValidDuration(duration);

		const file = await blob(stream);
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
	}

	#assertValidDuration(duration: any): asserts duration is typeof acceptedDurations[number] {
		if (!acceptedDurations.includes(duration)) {
			throw new Error(`Invalid duration "${duration}", accepted values are ${acceptedDurations.join(', ')}`);
		}
	}

	async #doRequest(data: FormData) {
		const init: RequestInit = {
			method: 'POST',
			headers: {
				'user-agent': USER_AGENT
			},
			body: data
		};

		this.emit('request', init);

		const res = await fetch(LITTERBOX_API_ENDPOINT, init);

		this.emit('response', res);

		return res.text();
	}
}
