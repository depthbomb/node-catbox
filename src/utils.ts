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
