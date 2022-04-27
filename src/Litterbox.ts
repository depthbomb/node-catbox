import fetch                              from 'node-fetch';
import FormData                           from 'form-data';
import { resolve }                        from 'node:path';
import { createReadStream }               from 'node:fs';

import { isValidFile }                    from './utils';
import { USER_AGENT, LITTERBOX_BASE_URL } from './constants';

type UploadOptions = {
	/**
	 * Path to the file to upload
	 */
	path: string;
	/**
	 * Duration before the file is deleted, defaults to `1h`
	 */
	duration?: '1h' | '12h' | '24h' | '72h';
};

export class Litterbox {
	/**
	 * Creates a new {@link Litterbox} instance
	 */
	public constructor() {};

	/**
	 * Uploads a file temporarily to Litterbox
	 * @param options Options
	 * @returns The uploaded file URL
	 */
	public async upload(options: UploadOptions): Promise<string> {
		let { path, duration } = options;
			path = resolve(path);
			duration = duration ?? '1h';

		if (!await isValidFile(path)) {
			throw new Error(`Invalid file path ${path}`);
		}

		const data = new FormData();
		data.append('reqtype', 'fileupload');
		data.append('fileToUpload', createReadStream(path));
		data.append('time', duration);

		const res = await fetch(LITTERBOX_BASE_URL, {
			method: 'POST',
			headers: {
				'user-agent': USER_AGENT
			},
			body: data
		});

		const text = await res.text();

		if (text.startsWith('https://litter.catbox.moe/')) {
			return text;
		} else {
			throw new Error(text);
		}
	};
};
