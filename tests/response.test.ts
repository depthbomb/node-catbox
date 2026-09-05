import { vi, test, expect, afterEach } from 'vitest';
import { Catbox, Litterbox } from '../dist/index.mjs';

afterEach(() => {
	vi.unstubAllGlobals();
});

test.each([200, 400, 503])('caps streamed HTTP %i responses without relying on Content-Length', async status => {
	const cancel = vi.fn();
	const chunks = [new Uint8Array(32 * 1024), new Uint8Array(32 * 1024), new Uint8Array(1)];
	const fetch  = vi.fn(async () => new Response(new ReadableStream({
		pull(controller) {
			const chunk = chunks.shift();
			if (chunk) {
				controller.enqueue(chunk);
			}
		},
		cancel
	}), {
		status,
		headers: {
			'Content-Length': '1'
		}
	}));
	vi.stubGlobal('fetch', fetch);
	await expect(new Catbox().uploadURL({
		url: 'https://example.com/file.png'
	})).rejects.toThrow('Response exceeds maximum size of 65536 bytes');
	expect(cancel).toHaveBeenCalledTimes(1);
	expect(fetch).toHaveBeenCalledTimes(1);
});

test('preserves split UTF-8 characters at the exact response limit', async () => {
	const body  = 'https://files.catbox.moe/é.png';
	const bytes = new TextEncoder().encode(body);
	vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({
		start(controller) {
			for (const byte of bytes) {
				controller.enqueue(Uint8Array.of(byte));
			}
			controller.close();
		}
	}))));
	const client = new Catbox(undefined, {
		maxResponseBytes: bytes.length
	});
	await expect(client.uploadURL({
		url: 'https://example.com/file.png'
	})).resolves.toBe(body);
});

test('counts bytes rather than characters for configurable response limits', async () => {
	vi.stubGlobal('fetch', vi.fn(async () => new Response('ééé')));
	const client = new Litterbox({
		maxResponseBytes: 4
	});
	await expect(client.uploadFile({
		path: './tests/file.png'
	})).rejects.toThrow('Response exceeds maximum size of 4 bytes');
});

test.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid response limit %s', maxResponseBytes => {
	expect(() => new Catbox(undefined, {
		maxResponseBytes
	})).toThrow('Invalid maximum response size');
	expect(() => new Litterbox({
		maxResponseBytes
	})).toThrow('Invalid maximum response size');
});
