import { afterEach, expect, test, vi } from 'vitest';
import { Catbox, Litterbox } from '../dist/index.mjs';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

test.each([500, 502, 503, 504, 408, 425, 429])('does not repeat album creation after HTTP %i by default', async status => {
	const fetch = vi.fn(async () => new Response('Ambiguous failure', {
		status
	}));
	vi.stubGlobal('fetch', fetch);

	await expect(new Catbox().createAlbum({
		title:       'Album',
		description: 'Description'
	})).rejects.toThrow(`HTTP ${status}`);
	expect(fetch).toHaveBeenCalledTimes(1);
});

test('does not repeat a Litterbox upload by default', async () => {
	const fetch = vi.fn(async () => new Response('Ambiguous failure', {
		status: 502
	}));
	vi.stubGlobal('fetch', fetch);

	await expect(new Litterbox().uploadFile({
		path: './tests/file.png'
	})).rejects.toThrow('HTTP 502');
	expect(fetch).toHaveBeenCalledTimes(1);
});
