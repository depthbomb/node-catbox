import fetch from 'node-fetch';
import FormData from 'form-data';
import { createReadStream } from 'fs';
import { USER_AGENT, LITTERBOX_BASE_URL } from './constants';

export class Litterbox {
	/**
	 * Creates a new {@link Litterbox} instance
	 */
	public constructor() {};

	/**
	 * Uploads a file temporarily to Litterbox
	 * @param path Path to the file to upload
	 * @param duration Duration that the file should last
	 * @returns The uploaded file URL
	 */
	public async upload(path: string, duration: '1h' | '12h' | '24h' | '72h' = '1h'): Promise<string> {
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
