import { vi, test, expect, afterEach } from 'vitest';
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

test.each(['2', 'Sat, 05 Sep 2026 12:00:02 GMT'])('honors Retry-After %s before retrying', async retryAfter => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
	const fetch = vi.fn().mockResolvedValueOnce(new Response('Wait', {
		status: 429,
		headers: {
			'Retry-After': retryAfter
		}
	})).mockResolvedValueOnce(new Response('https://files.catbox.moe/file.png'));
	vi.stubGlobal('fetch', fetch);
	const client = new Catbox(undefined, {
		retryTransientErrors: true
	});
	const upload = client.uploadURL({
		url: 'https://example.com/file.png'
	});
	await vi.advanceTimersByTimeAsync(1999);
	expect(fetch).toHaveBeenCalledTimes(1);
	await vi.advanceTimersByTimeAsync(1);
	await expect(upload).resolves.toBe('https://files.catbox.moe/file.png');
	expect(fetch).toHaveBeenCalledTimes(2);
});

test.each(['invalid', '-1', '1.5', '0', 'Fri, 04 Sep 2026 12:00:00 GMT'])('uses backoff for Retry-After %s', async retryAfter => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
	const fetch = vi.fn().mockResolvedValueOnce(new Response('Wait', {
		status: 503,
		headers: {
			'Retry-After': retryAfter
		}
	})).mockResolvedValueOnce(new Response('https://files.catbox.moe/file.png'));
	vi.stubGlobal('fetch', fetch);
	const client = new Catbox(undefined, {
		retryTransientErrors: true
	});
	const upload = client.uploadURL({
		url: 'https://example.com/file.png'
	});
	await vi.advanceTimersByTimeAsync(499);
	expect(fetch).toHaveBeenCalledTimes(1);
	await vi.advanceTimersByTimeAsync(1);
	await expect(upload).resolves.toBe('https://files.catbox.moe/file.png');
});

test('rejects an excessive Retry-After without retrying early', async () => {
	const cancel = vi.fn();
	const fetch  = vi.fn(async () => new Response(new ReadableStream({
		cancel
	}), {
		status: 503,
		headers: {
			'Retry-After': '999999999999999999999'
		}
	}));
	vi.stubGlobal('fetch', fetch);
	const client = new Catbox(undefined, {
		retryTransientErrors: true
	});
	await expect(client.uploadURL({
		url: 'https://example.com/file.png'
	})).rejects.toThrow('Retry-After exceeds');
	expect(fetch).toHaveBeenCalledTimes(1);
	expect(cancel).toHaveBeenCalledTimes(1);
});
