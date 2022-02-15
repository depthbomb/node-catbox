import fetch from 'node-fetch';
import FormData from 'form-data';
import { createReadStream } from 'fs';
import { USER_AGENT, CATBOX_BASE_URL } from './constants';

export class Catbox {
	private readonly _userHash?: string;

	/**
	 * Creates a new {@link Catbox} instance
	 * @param userHash Optional user hash
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

		const data = new FormData();
		data.append('reqtype', 'deletefiles');
		data.append('userhash', this._userHash);
		data.append('files', files.join(' '));

		const res = await this._doRequest(CATBOX_BASE_URL, data);

		if (!res.startsWith('Files successfully deleted')) {
			return true;
		} else {
			throw new Error(res); 
		}
	};

	/**
	 * Creates an album
	 * @param title Title of the album
	 * @param description Description of the album
	 * @param files Array of existing files to add to the album on creation
	 * @returns The album URL
	 */
	public async createAlbum(title: string, description: string | undefined = undefined, files: string[] | undefined = undefined): Promise<string> {
		const data = new FormData();
		data.append('reqtype', 'createalbum');
		data.append('title', title);
		data.append('desc', description ?? '');
		if (files && files.length) {
			data.append('files', files.join(' '));
		}
		if (this._userHash) {
			data.append('userhash', this._userHash);
		}

		const res = await this._doRequest(CATBOX_BASE_URL, data);

		if (res.startsWith('https://catbox.moe/c/')) {
			return res;
		} else {
			throw new Error(res);
		}
	};

	/**
	 * Edits an existing album
	 * 
	 * Values are treated as direct input. For example omitting the description will remove the album's description and supplying a new array of files will change the album's files.
	 * 
	 * Consider using the less-destructive {@link addFilesToAlbum} or {@link removeFilesToAlbum} methods if you wish to only modify album contents.
	 * @param id ID of the album to edit
	 * @param title New title of the album
	 * @param description New description of the album
	 * @param files Files that the album contains
	 * @returns The album URL
	 */
	public async editAlbum(id: string, title: string, description: string | null, files: string[]): Promise<string> {
		if (!this._userHash) {
			throw new Error('A user hash is required for this operation.');
		}

		const data = new FormData();
		data.append('reqtype', 'editalbum');
		data.append('short', id);
		data.append('title', title);
		data.append('desc', description ?? '');
		data.append('files', files.join(' '));
		data.append('userhash', this._userHash);

		const res = await this._doRequest(CATBOX_BASE_URL, data);

		if (res === `https://catbox.moe/c/${id}`) {
			return res;
		} else {
			throw new Error(res);
		}
	};

	/**
	 * Adds existing files to an album
	 * @param id ID of the album to add files to
	 * @param files Files to add to the album
	 * @returns The album URL
	 */
	public async addFilesToAlbum(id: string, files: string[]): Promise<string> {
		if (!this._userHash) {
			throw new Error('A user hash is required for this operation.');
		}

		const data = new FormData();
		data.append('reqtype', 'addtoalbum');
		data.append('short', id);
		data.append('files', files.join(' '));
		data.append('userhash', this._userHash);

		const res = await this._doRequest(CATBOX_BASE_URL, data);

		if (res === `https://catbox.moe/c/${id}`) {
			return res;
		} else {
			throw new Error(res);
		}
	};

	/**
	 * Removes files from an album
	 * @param id ID of the album to add files to
	 * @param files Files to remove from the album
	 * @returns The album URL
	 */
	public async removeFilesFromAlbum(id: string, files: string[]): Promise<string> {
		if (!this._userHash) {
			throw new Error('A user hash is required for this operation.');
		}

		const data = new FormData();
		data.append('reqtype', 'removefromalbum');
		data.append('short', id);
		data.append('files', files.join(' '));
		data.append('userhash', this._userHash);

		const res = await this._doRequest(CATBOX_BASE_URL, data);

		if (res === `https://catbox.moe/c/${id}`) {
			return res;
		} else {
			throw new Error(res);
		}
	};

	/**
	 * Deletes an album
	 * @param id ID of the album to delete
	 * @returns `true` if the album was deleted or if the album doesn't exist
	 */
	public async removeAlbum(id: string): Promise<boolean> {
		if (!this._userHash) {
			throw new Error('A user hash is required for this operation.');
		}

		const data = new FormData();
		data.append('reqtype', 'deletealbum');
		data.append('short', id);
		data.append('userhash', this._userHash);

		const res = await this._doRequest(CATBOX_BASE_URL, data);

		if (res.length === 0) {
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
