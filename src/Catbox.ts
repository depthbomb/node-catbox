import fetch from 'node-fetch';
import FormData from 'form-data';
import { createReadStream } from 'fs';
import { USER_AGENT, CATBOX_BASE_URL } from './constants';

export class Catbox {
	private readonly _userHash?: string;

	/**
	 * Creates a new {@link Catbox} instance
	 * @param userHash Optional user hash
	 * 
	 * @remarks
	 * 
	 * A user hash is required for all operations __except__ file uploads.
	 */
	public constructor(userHash?: string) {
		this._userHash = userHash;
	};

	/**
	 * Uploads a file via direct URL to Catbox.moe
	 * 
	 * Files uploaded while a `userHash` is provided will be tied to your account.
	 * @param url Direct file URL to upload
	 * @returns The uploaded file URL
	 */
	public async uploadURL(url: string): Promise<string> {
		const data = new FormData();

		data.append('reqtype', 'urlupload');
		data.append('url', url);
		if (this._userHash) {
			data.append('userhash', this._userHash);
		}

		const res = await this._doRequest(CATBOX_BASE_URL, data);

		if (res.startsWith('https://files.catbox.moe/')) {
			return res;
		} else {
			throw new Error(res);
		}
	};

	/**
	 * Uploads a file via its path to Catbox.moe
	 * 
	 * Files uploaded while a `userHash` is provided will be tied to your account.
	 * @param url Path of the file to upload
	 * @returns The uploaded file URL
	 */
	public async uploadFile(path: string): Promise<string> {
		const data = new FormData();

		data.append('reqtype', 'fileupload');
		data.append('fileToUpload', createReadStream(path));
		if (this._userHash) {
			data.append('userhash', this._userHash);
		}

		const res = await this._doRequest(CATBOX_BASE_URL, data);

		if (res.startsWith('https://files.catbox.moe/')) {
			return res;
		} else {
			throw new Error(res);
		}
	};

	/**
	 * Deletes files from the user account
	 * @param files Names of files to delete
	 * @returns `true` if files have been deleted successfully
	 */
	public async deleteFiles(files: string[]): Promise<boolean> {
		if (!this._userHash) {
			throw new Error('A user hash is required for this operation.');
		}

		const filesToDelete = files.map(f => f.trim()).join(' ');
		const data = new FormData();
		data.append('reqtype', 'deletefiles');
		data.append('userhash', this._userHash);
		data.append('files', filesToDelete);

		const res = await this._doRequest(CATBOX_BASE_URL, data);

		if (!res.startsWith('Files successfully deleted')) {
			return true;
		} else {
			throw new Error(res); 
		}
	};

	private async _doRequest(url: string, data: FormData): Promise<string> {
		const res = await fetch(url, {
			method: 'POST',
			headers: {
				'user-agent': USER_AGENT
			},
			body: data
		});

		const text = await res.text();

		return text;
	};
};
