import { isValidFile }                    from './utils';
import { $fetch }                         from 'ohmyfetch';
import { resolve }                        from 'node:path';
import { USER_AGENT, LITTERBOX_BASE_URL } from './constants';
import { FormData }                       from 'formdata-node';
import { fileFromPath }                   from 'formdata-node/file-from-path';

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
		data.set('reqtype', 'fileupload');
		data.set('fileToUpload', await fileFromPath(path));
		data.set('time', duration);

		const text = await $fetch<string>(LITTERBOX_BASE_URL, {
			method: 'POST',
			headers: {
				'user-agent': USER_AGENT
			},
			body: data,
			parseResponse: txt => txt
		});

		if (text.startsWith('https://litter.catbox.moe/')) {
			return text;
		} else {
			throw new Error(text);
		}
	};
};
