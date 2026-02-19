import { stat } from 'node:fs/promises';

export async function isValidFile(path: string): Promise<boolean> {
	try {
		const stats = await stat(path);

		return stats.isFile();
	} catch {
		return false;
	}
};

export type ResponseSnapshot = Readonly<{
	url: string;
	ok: boolean;
	status: number;
	statusText: string;
	redirected: boolean;
	type: Response['type'];
	headers: Readonly<Record<string, string>>;
}>;

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
