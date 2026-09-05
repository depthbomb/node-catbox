import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { addAbortListener } from 'node:events';
import { stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { rm, mkdtemp } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
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

async function nextWithSignal(iterator: AsyncIterator<unknown>, signal: AbortSignal): Promise<IteratorResult<unknown>> {
	signal.throwIfAborted();
	let rejectAbort!: (reason: unknown) => void;
	const aborted = new Promise<never>((_resolve, reject) => {
		rejectAbort = reject;
	});
	const listener = addAbortListener(signal, () => rejectAbort(signal.reason));
	try {
		return await Promise.race([iterator.next(), aborted]);
	} finally {
		listener[Symbol.dispose]();
	}
}

async function* abortableChunks(stream: ReadableStream | AsyncIterable<unknown>, signal: AbortSignal): AsyncGenerator<unknown> {
	const source = stream instanceof ReadableStream ? Readable.fromWeb(stream, {
		objectMode: true
	}) : stream;
	const iterator = source[Symbol.asyncIterator]();
	let complete = false;
	try {
		while (true) {
			const chunk = await nextWithSignal(iterator, signal);
			if (chunk.done) {
				complete = true;

				return;
			}

			yield chunk.value;
		}
	} finally {
		if (!complete) {
			if (signal.aborted && source instanceof Readable) {
				source.destroy();
			}

			const closing = iterator.return?.();
			if (signal.aborted) {
				// A caller's iterator may never settle its pending next() or return().
				// Observe late failures without holding temporary-file cleanup open.
				void Promise.resolve(closing).catch(() => undefined);
			} else {
				await closing;
			}
		}
	}
}

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

function headersInitToRecord(headers?: NonNullable<RequestInit['headers']>): Record<string, string> {
	if (!headers) {
		return {};
	}

	return Object.fromEntries(new Headers(headers).entries());
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
	maxBytes: number,
	signal?: AbortSignal
): Promise<{ blob: Blob; cleanup: () => Promise<void> }> {
	if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
		throw new Error(`Invalid max stream size "${maxBytes}", expected a positive integer`);
	}

	signal?.throwIfAborted();

	const tempDirPath = await mkdtemp(join(tmpdir(), 'node-catbox-'));
	const tempFilePath = join(tempDirPath, `${randomUUID()}.upload`);
	const streamWriter = createWriteStream(tempFilePath, { flags: 'wx' });

	const cleanup = async () => {
		await rm(tempDirPath, {
			recursive: true,
			force: true,
			maxRetries: 3,
			retryDelay: 100
		});
	};

	let totalBytes = 0;
	try {
		await pipeline(
			Readable.from(signal ? abortableChunks(stream, signal) : stream as AsyncIterable<unknown>),
			async function* (chunks) {
				for await (const rawChunk of chunks) {
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

					yield chunk;
				}
			},
			streamWriter,
			{
				signal
			}
		);

		const blob = await openAsBlob(tempFilePath);
		return { blob, cleanup };
	} catch (error) {
		try {
			await cleanup();
		} catch (cleanupError) {
			throw new AggregateError(
				[error, cleanupError],
				'Failed to stage the stream and clean up its temporary files',
				{ cause: cleanupError }
			);
		}
		signal?.throwIfAborted();
		throw error;
	}
}

export async function runWithCleanup<T>(
	operation: () => Promise<T>,
	cleanup: () => Promise<void>
): Promise<T> {
	let result: T;
	try {
		result = await operation();
	} catch (operationError) {
		try {
			await cleanup();
		} catch (cleanupError) {
			throw new AggregateError(
				[operationError, cleanupError],
				'The operation and temporary-file cleanup both failed',
				{ cause: cleanupError }
			);
		}
		throw operationError;
	}

	try {
		await cleanup();
	} catch (cleanupError) {
		// The remote operation already succeeded. Warn about the local leak while
		// preserving the result so callers are not encouraged to repeat the POST.
		const warning = Object.assign(
			new Error('Failed to clean up temporary upload files', { cause: cleanupError }),
			{ code: 'NODE_CATBOX_TEMP_CLEANUP_FAILED' }
		);
		process.emitWarning(warning);
	}

	return result;
}
