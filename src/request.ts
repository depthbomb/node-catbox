import {
	MAX_REQUEST_RETRIES,
	RETRY_DELAY_MS,
	USER_AGENT
} from './constants';
import {
	createRequestSnapshot,
	createResponseSnapshot
} from './utils';
import type { RequestSnapshot, ResponseSnapshot } from './utils';

export type ClientOptions = {
	/**
	 * Maximum time in milliseconds for each HTTP attempt, including upload and
	 * response-body transfer.
	 */
	requestTimeoutMs?: number;
};

type PostFormOptions = {
	endpoint: string;
	data: FormData;
	timeoutMs: number;
	onRequest: (request: RequestSnapshot) => void;
	onResponse: (response: ResponseSnapshot) => void;
};

export function validateRequestTimeout(timeoutMs: number): void {
	if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
		throw new Error(
			`Invalid request timeout "${timeoutMs}", expected an integer between 1 and 2147483647`
		);
	}
}

export async function postForm({
	endpoint,
	data,
	timeoutMs,
	onRequest,
	onResponse
}: PostFormOptions): Promise<string> {
	validateRequestTimeout(timeoutMs);

	for (let attempt = 0; attempt <= MAX_REQUEST_RETRIES; attempt++) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const init: RequestInit = {
				method: 'POST',
				headers: {
					'user-agent': USER_AGENT
				},
				body: data,
				signal: controller.signal
			};

			// Listener failures are deliberately outside transport error handling: a
			// completed non-idempotent POST must never be repeated because an observer threw.
			onRequest(createRequestSnapshot(endpoint, init));

			let response: Response;
			try {
				response = await fetch(endpoint, init);
			} catch (error) {
				throw normalizeRequestError(error, controller.signal, timeoutMs);
			}

			try {
				onResponse(createResponseSnapshot(response));
			} catch (error) {
				await response.body?.cancel().catch(() => undefined);
				throw error;
			}

			if (shouldRetryStatus(response.status) && attempt < MAX_REQUEST_RETRIES) {
				// Body disposal is best-effort. A custom stream's cancellation failure
				// must not suppress the retry selected from the HTTP status.
				await response.body?.cancel().catch(() => undefined);
			} else {
				let body: string;
				try {
					body = await response.text();
				} catch (error) {
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

		await waitForRetry(attempt);
	}

	throw new Error('Request failed after retries');
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

async function waitForRetry(attempt: number): Promise<void> {
	const delayMs = RETRY_DELAY_MS * (2 ** attempt);
	await new Promise(resolve => setTimeout(resolve, delayMs));
}
