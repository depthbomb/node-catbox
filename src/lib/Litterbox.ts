import { openAsBlob } from 'node:fs';
import { isValidFile } from '../utils';
import { resolve, basename } from 'node:path';
import { litterboxChannels } from '../diagnostics';
import { USER_AGENT, LITTERBOX_API_ENDPOINT } from '../constants';
import { INVALID_FILE_PATH, INVALID_LITTERBOX_DURATION } from '../messages';

type UploadOptions = {
	/**
	 * Path to the file to upload
	 */
	path: string;
	/**
	 * Duration before the file is deleted, defaults to `1h`
	 */
	duration?: typeof acceptedDurations[number] | FileLifetime;
};

const acceptedDurations = ['1h', '12h', '24h', '72h'] as const;

export const enum FileLifetime {
	OneHour = '1h',
	TwelveHours = '12h',
	OneDay = '24h',
	ThreeDays = '72h',
}

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
			throw new Error(INVALID_FILE_PATH(path));
		}

		if (duration) {
			if (!this.isDurationValid(duration)) {
				throw new Error(INVALID_LITTERBOX_DURATION(duration, acceptedDurations as unknown as string[]));
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

	private isDurationValid(duration: any): duration is typeof acceptedDurations[number] {
		return acceptedDurations.includes(duration);
	}
}
