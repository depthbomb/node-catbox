import { afterEach, expect, test, vi } from 'vitest';
import { stat } from 'node:fs/promises';
import { Catbox, Litterbox } from '../dist/index.mjs';

const stagedPaths = vi.hoisted(() => [] as string[]);

vi.mock('node:fs/promises', async importOriginal => {
	const original = await importOriginal<typeof import('node:fs/promises')>();

	return {
		...original,
		mkdtemp: async (...args: Parameters<typeof original.mkdtemp>) => {
			const path = await original.mkdtemp(...args);
			stagedPaths.push(String(path));

			return path;
		}
	};
});

afterEach(async () => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
	for (const path of stagedPaths.splice(0)) {
		await expect(stat(path)).rejects.toMatchObject({
			code: 'ENOENT'
		});
	}
});

test.each(['Catbox', 'Litterbox'])('%s cancels a stalled iterator and removes its temporary file', async name => {
	const client     = name === 'Catbox' ? new Catbox() : new Litterbox();
	const controller = new AbortController();
	const reason     = new Error('Caller cancelled');
	const fetch      = vi.fn();
	const entered    = Promise.withResolvers<void>();
	vi.stubGlobal('fetch', fetch);
	const upload = client.uploadFileStream({
		filename: 'stalled.bin',
		signal:   controller.signal,
		stream: (async function* () {
			yield Buffer.from('first');
			entered.resolve();
			await new Promise(() => {});
		})()
	});
	const assertion = expect(upload).rejects.toBe(reason);
	await entered.promise;
	expect(stagedPaths).toHaveLength(1);
	controller.abort(reason);
	await assertion;
	expect(fetch).not.toHaveBeenCalled();
});

test('cancels a stalled Web stream at its source', async () => {
	const controller = new AbortController();
	const entered    = Promise.withResolvers<void>();
	const cancel     = vi.fn();
	const fetch      = vi.fn();
	vi.stubGlobal('fetch', fetch);
	const upload = new Catbox().uploadFileStream({
		filename: 'stalled.bin',
		signal:   controller.signal,
		stream: new ReadableStream({
			pull() {
				entered.resolve();
			},
			cancel
		})
	});
	const assertion = expect(upload).rejects.toMatchObject({
		name: 'AbortError'
	});
	await entered.promise;
	// Wait until the source reader has been acquired after temporary-file setup.
	await vi.waitFor(() => expect(stagedPaths).toHaveLength(1));
	controller.abort();
	await assertion;
	expect(fetch).not.toHaveBeenCalled();
	expect(cancel).toHaveBeenCalledTimes(1);
});

test('rejects an already cancelled operation before staging or sending', async () => {
	const fetch  = vi.fn();
	const reason = new Error('Already cancelled');
	vi.stubGlobal('fetch', fetch);
	await expect(new Catbox().uploadFileStream({
		filename: 'cancelled.bin',
		signal:   AbortSignal.abort(reason),
		stream: (async function* () {
			yield Buffer.from('unused');
		})()
	})).rejects.toBe(reason);
	expect(stagedPaths).toHaveLength(0);
	expect(fetch).not.toHaveBeenCalled();
});

test('cancels a retry wait without issuing another request', async () => {
	const controller = new AbortController();
	const reason     = new Error('Stop retries');
	const cancel     = Promise.withResolvers<void>();
	const fetch      = vi.fn(async () => new Response(new ReadableStream({
		cancel() {
			cancel.resolve();
		}
	}), {
		status: 429,
		headers: {
			'Retry-After': '60'
		}
	}));
	vi.stubGlobal('fetch', fetch);
	const client = new Catbox(undefined, {
		retryTransientErrors: true
	});
	const upload = client.uploadURL({
		url:    'https://example.com/file.png',
		signal: controller.signal
	});
	const assertion = expect(upload).rejects.toBe(reason);
	await cancel.promise;
	controller.abort(reason);
	await assertion;
	expect(fetch).toHaveBeenCalledTimes(1);
});

test('preserves the caller reason when cancelling HTTP body transfer', async () => {
	const controller = new AbortController();
	const reason     = new Error('Stop transfer');
	const reading    = Promise.withResolvers<void>();
	vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => new Response(new ReadableStream({
		start(body) {
			init.signal?.addEventListener('abort', () => {
				body.error(new DOMException('Aborted', 'AbortError'));
			}, {
				once: true
			});
			reading.resolve();
		}
	}))));
	const upload = new Catbox().uploadURL({
		url:    'https://example.com/file.png',
		signal: controller.signal
	});
	const assertion = expect(upload).rejects.toBe(reason);
	await reading.promise;
	controller.abort(reason);
	await assertion;
});
