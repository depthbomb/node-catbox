import { openAsBlob } from 'node:fs';
import EventEmitter from 'node:events';
import { resolve, basename } from 'node:path';
import {
	CATBOX_API_ENDPOINT,
	CATBOX_REQUEST_TIMEOUT_MS,
	CATBOX_MAX_FILE_BYTES
} from '../constants';
import {
	isValidFile,
	runWithCleanup,
	assertValidHttpUrl,
	streamToBlobWithSizeLimit,
	assertFileSizeWithinLimit
} from '../utils';
import { postForm, validateRequestTimeout } from '../request';
import type { RequestSnapshot, ResponseSnapshot } from '../utils';
import type { ClientOptions, OperationOptions } from '../request';

type CatboxEvents = {
	uploadingURL:    [url: string];
	uploadingFile:   [filepath: string];
	uploadingStream: [filename: string];

	deletingFiles:          [files: string[]];
	creatingAlbum:          [title: string, description: string, files?: string[]];
	editingAlbum:           [id: string, title: string, description: string, files?: string[]];
	addingFilesToAlbum:     [id: string, files: string[]];
	removingFilesFromAlbum: [id: string, files: string[]];
	removingAlbum:          [id: string];

	request:  [request: RequestSnapshot];
	response: [response: ResponseSnapshot];
};

type UploadURLOptions = OperationOptions & {
	/**
	 * Direct URL of the file to upload
	 */
	url: string;
};

type UploadFileOptions = OperationOptions & {
	/**
	 * Path to the file to upload
	 */
	path: string;
	/**
	 * Maximum file size in bytes before throwing, defaults to 200 MB.
	 */
	maxFileBytes?: number;
};

type UploadFileStreamOptions = OperationOptions & {
	stream: ReadableStream<unknown> | AsyncIterable<unknown>;
	filename: string;
	/**
	 * Maximum stream size in bytes before throwing, defaults to 200 MB.
	 */
	maxStreamBytes?: number;
};

type DeleteFilesOptions = OperationOptions & {
	/**
	 * Array of existing file names (including extension) to delete
	 */
	files: string[];
};

type CreateAlbumOptions = OperationOptions & {
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

type AddFilesToAlbumOptions = OperationOptions & {
	/**
	 * ID of the album
	 */
	id: string;
	/**
	 * Names of existing files to add to the album
	 */
	files: string[];
};

type RemoveFilesFromAlbumOptions = OperationOptions & {
	/**
	 * ID of the album
	 */
	id: string;
	/**
	 * Names of existing files to remove from the album
	 */
	files: string[];
};

type DeleteAlbumOptions = OperationOptions & {
	/**
	 * ID of the album
	 */
	id: string;
};

export class Catbox extends EventEmitter<CatboxEvents> {
	#userHash?: string;
	readonly #requestTimeoutMs: number;
	readonly #retryTransientErrors: boolean;

	/**
	 * Creates a new {@link Catbox} instance
	 * @param userHash Optional user hash
	 * @param options Client request options
	 */
	public constructor(userHash?: string, { requestTimeoutMs = CATBOX_REQUEST_TIMEOUT_MS, retryTransientErrors = false }: ClientOptions = {}) {
		super();
		validateRequestTimeout(requestTimeoutMs);
		this.#requestTimeoutMs     = requestTimeoutMs;
		this.#retryTransientErrors = retryTransientErrors === true;
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
	public async uploadURL({ url, signal }: UploadURLOptions) {
		signal?.throwIfAborted();

		assertValidHttpUrl(url);

		const data = new FormData();
		data.set('reqtype', 'urlupload');
		data.set('url', url);

		if (this.#userHash) {
			data.set('userhash', this.#userHash);
		}

		this.emit('uploadingURL', url);

		const res = await this.#doRequest(data, signal);
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
	public async uploadFile({ path, maxFileBytes = CATBOX_MAX_FILE_BYTES, signal }: UploadFileOptions) {
		signal?.throwIfAborted();

		path = resolve(path);

		if (!await isValidFile(path)) {
			throw new Error(`Invalid file path "${path}"`);
		}
		await assertFileSizeWithinLimit(path, maxFileBytes);

		const file = await openAsBlob(path);
		const data = new FormData();
		data.set('reqtype', 'fileupload');
		data.set('fileToUpload', file, basename(path));

		if (this.#userHash) {
			data.set('userhash', this.#userHash);
		}

		this.emit('uploadingFile', path);

		const res = await this.#doRequest(data, signal);
		if (res.startsWith('https://files.catbox.moe/')) {
			return res;
		} else {
			throw new Error(res);
		}
	}

	public async uploadFileStream({ stream, filename, maxStreamBytes = CATBOX_MAX_FILE_BYTES, signal }: UploadFileStreamOptions) {
		signal?.throwIfAborted();

		const { blob: file, cleanup } = await streamToBlobWithSizeLimit(stream, maxStreamBytes, signal);
		return runWithCleanup(async () => {
			const data = new FormData();
			data.set('reqtype', 'fileupload');
			data.set('fileToUpload', file, filename);

			if (this.#userHash) {
				data.set('userhash', this.#userHash);
			}

			this.emit('uploadingStream', filename);

			const res = await this.#doRequest(data, signal);
			if (res.startsWith('https://files.catbox.moe/')) {
				return res;
			} else {
				throw new Error(res);
			}
		}, cleanup);
	}

	/**
	 * Deletes files from the user account
	 * @param options Options
	 * @returns `true` if files have been deleted successfully
	 */
	public async deleteFiles({ files, signal }: DeleteFilesOptions) {
		signal?.throwIfAborted();

		const data = new FormData();
		data.set('reqtype', 'deletefiles');
		data.set('userhash', this.#getUserHashOrThrow());
		data.set('files', files.join(' '));

		this.emit('deletingFiles', files);

		const res = await this.#doRequest(data, signal);
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
	public async createAlbum({ title, description, files, signal }: CreateAlbumOptions) {
		signal?.throwIfAborted();

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

		this.emit('creatingAlbum', title, description, files);

		const res = await this.#doRequest(data, signal);
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
	public async editAlbum({ id, title, description, files, signal }: EditAlbumOptions) {
		signal?.throwIfAborted();

		const data = new FormData();
		data.set('reqtype', 'editalbum');
		data.set('short', id);
		data.set('title', title);
		data.set('desc', description);

		if (files && files.length) {
			data.set('files', files.join(' '));
		}

		data.set('userhash', this.#getUserHashOrThrow());

		this.emit('editingAlbum', id, title, description, files);

		const res = await this.#doRequest(data, signal);
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
	public async addFilesToAlbum({ id, files, signal }: AddFilesToAlbumOptions) {
		signal?.throwIfAborted();

		const data = new FormData();
		data.set('reqtype', 'addtoalbum');
		data.set('short', id);
		data.set('files', files.join(' '));
		data.set('userhash', this.#getUserHashOrThrow());

		this.emit('addingFilesToAlbum', id, files);

		const res = await this.#doRequest(data, signal);
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
	public async removeFilesFromAlbum({ id, files, signal }: RemoveFilesFromAlbumOptions) {
		signal?.throwIfAborted();

		const data = new FormData();
		data.set('reqtype', 'removefromalbum');
		data.set('short', id);
		data.set('files', files.join(' '));
		data.set('userhash', this.#getUserHashOrThrow());

		this.emit('removingFilesFromAlbum', id, files);

		const res = await this.#doRequest(data, signal);
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
	public async removeAlbum({ id, signal }: DeleteAlbumOptions) {
		signal?.throwIfAborted();

		const data = new FormData();
		data.set('reqtype', 'deletealbum');
		data.set('short', id);
		data.set('userhash', this.#getUserHashOrThrow());

		this.emit('removingAlbum', id);

		const res = await this.#doRequest(data, signal);
		if (res.length === 0) {
			return true;
		} else {
			throw new Error(res);
		}
	}

	async #doRequest(data: FormData, signal?: AbortSignal) {
		return postForm({
			endpoint: CATBOX_API_ENDPOINT,
			data,
			timeoutMs: this.#requestTimeoutMs,
			retryTransientErrors: this.#retryTransientErrors,
			signal,
			onRequest: request => this.emit('request', request),
			onResponse: response => this.emit('response', response)
		});
	}

	#getUserHashOrThrow() {
		if (!this.#userHash) {
			throw new Error('A user hash is required for this operation.');
		}

		return this.#userHash;
	}
}
