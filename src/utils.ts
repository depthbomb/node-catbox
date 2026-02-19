import { stat } from 'node:fs/promises';

export type ResponseSnapshot = Readonly<{
	url: string;
	ok: boolean;
	status: number;
	statusText: string;
	redirected: boolean;
	type: Response['type'];
	headers: Readonly<Record<string, string>>;
}>;

type StreamChunk = string | ArrayBuffer | ArrayBufferView;

const textEncoder = new TextEncoder();

export const DEFAULT_MAX_STREAM_BYTES = 100 * 1024 * 1024;

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
	maxBytes: number = DEFAULT_MAX_STREAM_BYTES
): Promise<Blob> {
	if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
		throw new Error(`Invalid max stream size "${maxBytes}", expected a positive integer`);
	}

	let totalBytes = 0;
	const chunks: Uint8Array[] = [];

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

		chunks.push(chunk);
	}

	return new Blob(chunks);
}
