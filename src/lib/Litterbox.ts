import { openAsBlob } from 'node:fs';
import { isValidFile } from '../utils';
import { blob } from 'node:stream/consumers';
import { resolve, basename } from 'node:path';
import { litterboxChannels } from '../diagnostics';
import { USER_AGENT, LITTERBOX_API_ENDPOINT } from '../constants';

type UploadFileOptions = {
	/**
	 * Path to the file to upload
	 */
	path: string;
	/**
	 * Duration before the file is deleted, defaults to `1h`
	 */
	duration?: typeof acceptedDurations[number] | FileLifetime;
};

type UploadFileStreamOptions = {
	stream: ReadableStream | AsyncIterable<any>;
	filename: string;
	/**
	 * Duration before the file is deleted, defaults to `1h`
	 */
	duration?: typeof acceptedDurations[number] | FileLifetime;
};

export const acceptedDurations = ['1h', '12h', '24h', '72h'] as const;

export const enum FileLifetime {
	OneHour     = '1h',
	TwelveHours = '12h',
	OneDay      = '24h',
	ThreeDays   = '72h',
}

export class Litterbox {
	/**
	 * Uploads a file temporarily to Litterbox
	 * @param options Options
	 * @returns The uploaded file URL
	 */
	public async uploadFile({ path, duration = FileLifetime.OneHour }: UploadFileOptions) {
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

		const res = await this.#doRequest(data);
		if (res.startsWith('https://litter.catbox.moe/')) {
			return res;
		} else {
			throw new Error(res);
		}
	}

	public async uploadFileStream({ stream, filename, duration = FileLifetime.OneHour }: UploadFileStreamOptions) {
		this.#assertValidDuration(duration);

		const file = await blob(stream);
		const data = new FormData();
		data.set('reqtype', 'fileupload');
		data.set('fileToUpload', file, filename);
		data.set('time', duration);

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

		if (litterboxChannels.create.hasSubscribers) {
			litterboxChannels.create.publish({ request: init });
		}

		const res = await fetch(LITTERBOX_API_ENDPOINT, init);

		return res.text();
	}
}
