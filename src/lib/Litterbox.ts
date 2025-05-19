import { openAsBlob } from 'node:fs';
import { isValidFile } from '../utils';
import { resolve, basename } from 'node:path';
import { litterboxChannels } from '../diagnostics';
import { USER_AGENT, LITTERBOX_API_ENDPOINT } from '../constants';

type UploadOptions = {
	/**
	 * Path to the file to upload
	 */
	path: string;
	/**
	 * Duration before the file is deleted, defaults to `1h`
	 */
	duration?: '1h' | '12h' | '24h' | '72h' | string & {};
};

export class Litterbox {
	/**
	 * Creates a new {@link Litterbox} instance
	 */
	public constructor() {}

	/**
	 * Uploads a file temporarily to Litterbox
	 * @param options Options
	 * @returns The uploaded file URL
	 */
	public async upload({ path, duration }: UploadOptions): Promise<string> {
		path = resolve(path);

		if (!await isValidFile(path)) {
			throw new Error(`Invalid file path "${path}"`);
		}

		if (duration) {
			const acceptedDurations = ['1h', '12h', '24h', '72h'];
			if (!acceptedDurations.includes(duration)) {
				throw new Error(`Invalid duration "${duration}", accepted values are ${acceptedDurations.join(', ')}`);
			}
		} else {
			duration = '1h';
		}

		const file = await openAsBlob(path);
		const data = new FormData();
		data.set('reqtype', 'fileupload');
		data.set('fileToUpload', file, basename(path));
		data.set('time', duration);

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

		const res  = await fetch(LITTERBOX_API_ENDPOINT, init);
		const text = await res.text();
		if (text.startsWith('https://litter.catbox.moe/')) {
			return text;
		} else {
			throw new Error(text);
		}
	}
}
