import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { rm, mkdtemp } from 'node:fs/promises';
import { openAsBlob, createWriteStream } from 'node:fs';

export type ResponseSnapshot = Readonly<{
	url: string;
	ok: boolean;
	status: number;
	statusText: string;
	redirected: boolean;
	type: Response['type'];
	headers: Readonly<Record<string, string>>;
}>;

export type RequestSnapshot = Readonly<{
	url: string;
	method: string;
	headers: Readonly<Record<string, string>>;
	hasBody: boolean;
}>;

type StreamChunk = string | ArrayBuffer | ArrayBufferView;

const textEncoder = new TextEncoder();

export async function isValidFile(path: string): Promise<boolean> {
	try {
		const stats = await stat(path);

		return stats.isFile();
	} catch {
		return false;
	}
};

export function createResponseSnapshot(response: Response): ResponseSnapshot {
	const headers = Object.freeze(Object.fromEntries(response.headers.entries()));

	return Object.freeze({
		url: response.url,
		ok: response.ok,
		status: response.status,
		statusText: response.statusText,
		redirected: response.redirected,
		type: response.type,
		headers
	});
}

type RequestHeaders = Headers | Record<string, string | undefined> | Array<[string, string]>;

function headersInitToRecord(headers?: RequestHeaders): Record<string, string> {
	if (!headers) {
		return {};
	}

	if (headers instanceof Headers) {
		return Object.fromEntries(headers.entries());
	}

	if (Array.isArray(headers)) {
		return Object.fromEntries(headers);
	}

	return Object.fromEntries(
		Object.entries(headers).filter(([, value]) => value !== undefined) as Array<[string, string]>
	);
}

export function createRequestSnapshot(url: string, init: RequestInit): RequestSnapshot {
	return Object.freeze({
		url,
		method: init.method ?? 'GET',
		headers: Object.freeze(headersInitToRecord(init.headers)),
		hasBody: init.body !== undefined && init.body !== null
	});
}

export function assertValidHttpUrl(url: string): void {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
			throw new Error();
		}
	} catch {
		throw new Error(`Invalid URL "${url}", expected an absolute http(s) URL`);
	}
}

export async function assertFileSizeWithinLimit(path: string, maxBytes: number): Promise<void> {
	if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
		throw new Error(`Invalid max file size "${maxBytes}", expected a positive integer`);
	}

	const stats = await stat(path);
	if (stats.size > maxBytes) {
		throw new Error(`File exceeds maximum size of ${maxBytes} bytes`);
	}
}

function toUint8Array(chunk: StreamChunk): Uint8Array {
	if (typeof chunk === 'string') {
		return textEncoder.encode(chunk);
	}

	if (chunk instanceof ArrayBuffer) {
		return new Uint8Array(chunk);
	}

	return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
}

export async function streamToBlobWithSizeLimit(
	stream: ReadableStream | AsyncIterable<unknown>,
	maxBytes: number
): Promise<{ blob: Blob; cleanup: () => Promise<void> }> {
	if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
		throw new Error(`Invalid max stream size "${maxBytes}", expected a positive integer`);
	}

	const tempDirPath = await mkdtemp(join(tmpdir(), 'node-catbox-'));
	const tempFilePath = join(tempDirPath, `${randomUUID()}.upload`);
	const streamWriter = createWriteStream(tempFilePath, { flags: 'wx' });

	const cleanup = async () => {
		await rm(tempDirPath, { recursive: true, force: true });
	};

	let totalBytes = 0;
	try {
		for await (const rawChunk of stream as AsyncIterable<unknown>) {
			if (
				typeof rawChunk !== 'string'
				&& !(rawChunk instanceof ArrayBuffer)
				&& !ArrayBuffer.isView(rawChunk)
			) {
				throw new Error('Invalid stream chunk type, expected string, ArrayBuffer, or ArrayBufferView');
			}

			const chunk = toUint8Array(rawChunk);
			totalBytes += chunk.byteLength;

			if (totalBytes > maxBytes) {
				throw new Error(`Stream exceeds maximum size of ${maxBytes} bytes`);
			}

			if (!streamWriter.write(chunk)) {
				await once(streamWriter, 'drain');
			}
		}

		streamWriter.end();
		await once(streamWriter, 'close');

		const blob = await openAsBlob(tempFilePath);
		return { blob, cleanup };
	} catch (err) {
		streamWriter.destroy();
		await cleanup();
		throw err;
	}
}
