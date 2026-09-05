import { addAbortListener } from 'node:events';
import { createRequestSnapshot, createResponseSnapshot } from './utils';
import { USER_AGENT, RETRY_DELAY_MS, MAX_RESPONSE_BYTES, MAX_REQUEST_RETRIES } from './constants';
import type { RequestSnapshot, ResponseSnapshot } from './utils';

export type ClientOptions = {
	/**
	 * Maximum time in milliseconds for each HTTP attempt, including upload and
	 * response-body transfer.
	 */
	requestTimeoutMs?: number;
	/*
	 * Opt into up to two retries of transient HTTP errors. A retry can duplicate
	 * an operation that already completed remotely. Defaults to false.
	 */
	retryTransientErrors?: boolean;
	/* Maximum decoded HTTP response bytes to read, defaults to 64 KiB. */
	maxResponseBytes?: number;
};

export type OperationOptions = {
	/* Cancels input staging, HTTP transfer, and retry waits for this operation. */
	signal?: AbortSignal;
};

type PostFormOptions = OperationOptions & {
	endpoint: string;
	data: FormData;
	timeoutMs: number;
	retryTransientErrors?: boolean;
	maxResponseBytes?: number;
	onRequest: (request: RequestSnapshot) => void;
	onResponse: (response: ResponseSnapshot) => void;
};

async function readResponseText(response: Response, maxBytes: number): Promise<string> {
	const reader = response.body?.getReader();
	if (!reader) {
		return '';
	}

	const decoder = new TextDecoder();
	let bytes = 0;
	let text  = '';
	try {
		while (true) {
			const chunk = await reader.read();
			if (chunk.done) {
				return text + decoder.decode();
			}

			bytes += chunk.value.byteLength;
			if (bytes > maxBytes) {
				throw new Error(`Response exceeds maximum size of ${maxBytes} bytes`);
			}

			text += decoder.decode(chunk.value, {
				stream: true
			});
		}
	} catch (error) {
		await reader.cancel().catch(() => undefined);
		throw error;
	} finally {
		reader.releaseLock();
	}
}

function retryDelay(response: Response, attempt: number, timeoutMs: number): number {
	const fallback = RETRY_DELAY_MS * (2 ** attempt);
	const value    = response.headers.get('retry-after')?.trim();
	if (!value) {
		return fallback;
	}

	const seconds = /^\d+$/.test(value);
	const date    = /^[A-Za-z]+[ ,]/.test(value) ? Date.parse(value) : NaN;
	const delayMs = seconds ? Number(value) * 1000 : date - Date.now();
	if (Number.isNaN(delayMs)) {
		return fallback;
	}

	if (delayMs > timeoutMs) {
		throw new Error(`Retry-After exceeds the maximum retry wait of ${timeoutMs} ms`);
	}

	return Math.max(fallback, delayMs);
}

function shouldRetryStatus(status: number): boolean {
	return status === 408 || status === 425 || status === 429 || status >= 500;
}

function normalizeRequestError(error: unknown, signal: AbortSignal, timeoutMs: number): unknown {
	if (signal.aborted && error instanceof Error && error.name === 'AbortError') {
		return new Error(`Request timed out after ${timeoutMs} ms`, { cause: error });
	}

	return error;
}

async function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
	signal?.throwIfAborted();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let listener: Disposable | undefined;
	try {
		await new Promise<void>((resolve, reject) => {
			timer = setTimeout(resolve, delayMs);
			if (signal) {
				listener = addAbortListener(signal, () => reject(signal.reason));
			}
		});
	} finally {
		clearTimeout(timer);
		listener?.[Symbol.dispose]();
	}
}

export function validateRequestTimeout(timeoutMs: number): void {
	if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
		throw new Error(
			`Invalid request timeout "${timeoutMs}", expected an integer between 1 and 2147483647`
		);
	}
}

export function validateResponseSizeLimit(maxBytes: number): void {
	if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
		throw new Error(`Invalid maximum response size "${maxBytes}", expected a positive safe integer`);
	}
}

export async function postForm({
	endpoint,
	data,
	timeoutMs,
	retryTransientErrors = false,
	maxResponseBytes = MAX_RESPONSE_BYTES,
	signal,
	onRequest,
	onResponse
}: PostFormOptions): Promise<string> {
	validateRequestTimeout(timeoutMs);
	validateResponseSizeLimit(maxResponseBytes);
	signal?.throwIfAborted();

	for (let attempt = 0; attempt <= MAX_REQUEST_RETRIES; attempt++) {
		let delayMs = 0;
		const controller = new AbortController();
		const attemptSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const init: RequestInit = {
				method: 'POST',
				headers: {
					'user-agent': USER_AGENT
				},
				body: data,
				signal: attemptSignal
			};

			// Listener failures are deliberately outside transport error handling: a
			// completed non-idempotent POST must never be repeated because an observer threw.
			onRequest(createRequestSnapshot(endpoint, init));
			attemptSignal.throwIfAborted();

			let response: Response;
			try {
				response = await fetch(endpoint, init);
			} catch (error) {
				signal?.throwIfAborted();
				throw normalizeRequestError(error, controller.signal, timeoutMs);
			}

			try {
				onResponse(createResponseSnapshot(response));
			} catch (error) {
				await response.body?.cancel().catch(() => undefined);
				throw error;
			}

			if (retryTransientErrors === true && shouldRetryStatus(response.status) && attempt < MAX_REQUEST_RETRIES) {
				// Body disposal is best-effort. A custom stream's cancellation failure
				// must not suppress the retry selected from the HTTP status.
				await response.body?.cancel().catch(() => undefined);
				delayMs = retryDelay(response, attempt, timeoutMs);
			} else {
				let body: string;
				try {
					body = await readResponseText(response, maxResponseBytes);
				} catch (error) {
					signal?.throwIfAborted();
					throw normalizeRequestError(error, controller.signal, timeoutMs);
				}

				if (!response.ok) {
					const status = `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
					throw new Error(`Request failed with HTTP ${status}${body ? `: ${body}` : ''}`);
				}

				return body;
			}
		} finally {
			clearTimeout(timeout);
		}

		await waitForRetry(delayMs, signal);
	}

	throw new Error('Request failed after retries');
}
