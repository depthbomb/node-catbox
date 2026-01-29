import { openAsBlob } from 'node:fs';
import { isValidFile } from '../utils';
import { blob } from 'node:stream/consumers';
import { resolve, basename } from 'node:path';
import { catboxChannels } from '../diagnostics';
import { USER_AGENT, CATBOX_API_ENDPOINT } from '../constants';

type UploadURLOptions = {
	/**
	 * Direct URL of the file to upload
	 */
	url: string;
};

type UploadFileOptions = {
	/**
	 * Path to the file to upload
	 */
	path: string;
};

type UploadFileStreamOptions = {
	stream: ReadableStream | AsyncIterable<any>;
	filename: string;
};

type DeleteFilesOptions = {
	/**
	 * Array of existing file names (including extension) to delete
	 */
	files: string[];
};

type CreateAlbumOptions = {
	/**
	 * Title of the album
	 */
	title: string;
	/**
	 * Description of the album
	 */
	description: string;
	/**
	 * Names of existing files that the album should contain
	 */
	files?: string[];
};

type EditAlbumOptions = CreateAlbumOptions & {
	/**
	 * ID of the album
	 */
	id: string;
};

type AddFilesToAlbumOptions = {
	/**
	 * ID of the album
	 */
	id: string;
	/**
	 * Names of existing files to add to the album
	 */
	files: string[];
};

type RemoveFilesFromAlbumOptions = {
	/**
	 * ID of the album
	 */
	id: string;
	/**
	 * Names of existing files to remove from the album
	 */
	files: string[];
};

type DeleteAlbumOptions = {
	/**
	 * ID of the album
	 */
	id: string;
};

export class Catbox {
	#userHash?: string;

	/**
	 * Creates a new {@link Catbox} instance
	 * @param userHash Optional user hash
	 */
	public constructor(userHash?: string) {
		if (userHash) {
			this.setUserHash(userHash);
		}
	}

	/**
	 * The user hash, if available
	 */
	public get userHash() {
		return this.#userHash;
	}

	/**
	 * Sets the user hash for this instance
	 * @param userHash Your account's user hash
	 * @see https://catbox.moe/user/manage.php
	 */
	public setUserHash(userHash: string) {
		this.#userHash = userHash;
	}

	/**
	 * Uploads a file via direct URL to Catbox.moe
	 *
	 * Files uploaded while a `userHash` is provided will be tied to your account.
	 * @param options Options
	 * @returns The uploaded file URL
	 */
	public async uploadURL({ url }: UploadURLOptions) {
		const data = new FormData();
		data.set('reqtype', 'urlupload');
		data.set('url', url);

		if (this.#userHash) {
			data.set('userhash', this.#userHash);
		}

		const res = await this.#doRequest(data);
		if (res.startsWith('https://files.catbox.moe/')) {
			return res;
		} else {
			throw new Error(res);
		}
	}

	/**
	 * Uploads a file via its path to Catbox.moe
	 *
	 * Files uploaded while a `userHash` is provided will be tied to your account.
	 * @param options Options
	 * @returns The uploaded file URL
	 */
	public async uploadFile({ path }: UploadFileOptions) {
		path = resolve(path);

		if (!await isValidFile(path)) {
			throw new Error(`Invalid file path "${path}"`);
		}

		const file = await openAsBlob(path);
		const data = new FormData();
		data.set('reqtype', 'fileupload');
		data.set('fileToUpload', file, basename(path));

		if (this.#userHash) {
			data.set('userhash', this.#userHash);
		}

		const res = await this.#doRequest(data);
		if (res.startsWith('https://files.catbox.moe/')) {
			return res;
		} else {
			throw new Error(res);
		}
	}

	public async uploadFileStream({ stream, filename }: UploadFileStreamOptions) {
		const file = await blob(stream);
		const data = new FormData();
		data.set('reqtype', 'fileupload');
		data.set('fileToUpload', file, filename);

		const res = await this.#doRequest(data);
		if (res.startsWith('https://files.catbox.moe/')) {
			return res;
		} else {
			throw new Error(res);
		}
	}

	/**
	 * Deletes files from the user account
	 * @param options Options
	 * @returns `true` if files have been deleted successfully
	 */
	public async deleteFiles({ files }: DeleteFilesOptions) {
		const data = new FormData();
		data.set('reqtype', 'deletefiles');
		data.set('userhash', this.#getUserHashOrThrow());
		data.set('files', files.join(' '));

		const res = await this.#doRequest(data);
		if (res.includes('successfully')) {
			return true;
		} else {
			throw new Error(res);
		}
	}

	/**
	 * Creates an album
	 * @param options Options
	 * @returns The album URL
	 */
	public async createAlbum({ title, description, files }: CreateAlbumOptions) {
		const data = new FormData();
		data.set('reqtype', 'createalbum');
		data.set('title', title);
		data.set('desc', description);

		if (files && files.length) {
			data.set('files', files.join(' '));
		}

		if (this.#userHash) {
			data.set('userhash', this.#userHash);
		}

		const res = await this.#doRequest(data);
		if (res.startsWith('https://catbox.moe/c/')) {
			return res;
		} else {
			throw new Error(res);
		}
	}

	/**
	 * Edits an existing album
	 *
	 * Values are treated as direct input. For example omitting the description will remove the album's description and supplying a new array of files will change the album's files.
	 *
	 * Consider using the less-destructive {@link addFilesToAlbum} or {@link removeFilesFromAlbum} methods if you wish to only modify album contents.
	 * @param options Options
	 * @returns The album URL
	 */
	public async editAlbum({ id, title, description, files }: EditAlbumOptions) {
		const data = new FormData();
		data.set('reqtype', 'editalbum');
		data.set('short', id);
		data.set('title', title);
		data.set('desc', description);

		if (files && files.length) {
			data.set('files', files.join(' '));
		}

		data.set('userhash', this.#getUserHashOrThrow());

		const res = await this.#doRequest(data);
		if (res === `https://catbox.moe/c/${id}`) {
			return res;
		} else {
			throw new Error(res);
		}
	}

	/**
	 * Adds existing files to an album
	 * @param options Options
	 * @returns The album URL
	 */
	public async addFilesToAlbum({ id, files }: AddFilesToAlbumOptions) {
		const data = new FormData();
		data.set('reqtype', 'addtoalbum');
		data.set('short', id);
		data.set('files', files.join(' '));
		data.set('userhash', this.#getUserHashOrThrow());

		const res = await this.#doRequest(data);
		if (res === `https://catbox.moe/c/${id}`) {
			return res;
		} else {
			throw new Error(res);
		}
	}

	/**
	 * Removes files from an album
	 * @param options Options
	 * @returns The album URL
	 */
	public async removeFilesFromAlbum({ id, files }: RemoveFilesFromAlbumOptions) {
		const data = new FormData();
		data.set('reqtype', 'removefromalbum');
		data.set('short', id);
		data.set('files', files.join(' '));
		data.set('userhash', this.#getUserHashOrThrow());

		const res = await this.#doRequest(data);
		if (res === `https://catbox.moe/c/${id}`) {
			return res;
		} else {
			throw new Error(res);
		}
	}

	/**
	 * Deletes an album
	 * @param options Options
	 * @returns `true` if the album was deleted or if the album doesn't exist
	 */
	public async removeAlbum({ id }: DeleteAlbumOptions) {
		const data = new FormData();
		data.set('reqtype', 'deletealbum');
		data.set('short', id);
		data.set('userhash', this.#getUserHashOrThrow());

		const res = await this.#doRequest(data);
		if (res.length === 0) {
			return true;
		} else {
			throw new Error(res);
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

		if (catboxChannels.create.hasSubscribers) {
			catboxChannels.create.publish({ request: init });
		}

		const res = await fetch(CATBOX_API_ENDPOINT, init);

		return res.text();
	}

	#getUserHashOrThrow() {
		if (!this.#userHash) {
			throw new Error('A user hash is required for this operation.');
		}

		return this.#userHash;
	}
}
