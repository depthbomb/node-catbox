import { basename } from 'node:path';
import { test, expect, vi } from 'vitest';
import { createReadStream } from 'node:fs';
import { Litterbox, FileLifetime, FileNameLength } from '../dist/index.mjs';

const lb = new Litterbox();
const testFilePath = './tests/file.png';
const invalidFilePath = '../../../should/not/exist.exe';

test('uploads from file path', async () => {
	await expect(lb.uploadFile({ path: testFilePath })).resolves.toContain('https://litter.catbox.moe/');
});

test('throws on invalid file path', async () => {
	await expect(() => lb.uploadFile({ path: invalidFilePath })).rejects.toThrowError(/Invalid file path /);
});

test('throws when file exceeds max size', async () => {
	await expect(() => lb.uploadFile({ path: testFilePath, maxFileBytes: 1 })).rejects.toThrowError(/File exceeds maximum size /);
});

test('uploads from file stream', async () => {
	await expect(lb.uploadFileStream({ stream: createReadStream(testFilePath), filename: basename(testFilePath) })).resolves.toContain('https://litter.catbox.moe/');
});

test('throws when stream exceeds max size', async () => {
	await expect(() => lb.uploadFileStream({
		stream: createReadStream(testFilePath),
		filename: basename(testFilePath),
		maxStreamBytes: 1
	})).rejects.toThrowError(/Stream exceeds maximum size /);
});

test('uploads with defined string duration', async () => {
	await expect(lb.uploadFile({ path: testFilePath, duration: '1h' })).resolves.toContain('https://litter.catbox.moe/');
	await expect(lb.uploadFile({ path: testFilePath, duration: '12h' })).resolves.toContain('https://litter.catbox.moe/');
	await expect(lb.uploadFile({ path: testFilePath, duration: '24h' })).resolves.toContain('https://litter.catbox.moe/');
	await expect(lb.uploadFile({ path: testFilePath, duration: '72h' })).resolves.toContain('https://litter.catbox.moe/');
});

test('uploads with defined enum duration', async () => {
	await expect(lb.uploadFile({ path: testFilePath, duration: FileLifetime.OneHour })).resolves.toContain('https://litter.catbox.moe/');
	await expect(lb.uploadFile({ path: testFilePath, duration: FileLifetime.TwelveHours })).resolves.toContain('https://litter.catbox.moe/');
	await expect(lb.uploadFile({ path: testFilePath, duration: FileLifetime.OneDay })).resolves.toContain('https://litter.catbox.moe/');
	await expect(lb.uploadFile({ path: testFilePath, duration: FileLifetime.ThreeDays })).resolves.toContain('https://litter.catbox.moe/');
});

test('uploads with defined enum file name length', async () => {
	await expect(lb.uploadFile({ path: testFilePath, fileNameLength: FileNameLength.Six })).resolves.toHaveLength(36);
	await expect(lb.uploadFile({ path: testFilePath, fileNameLength: FileNameLength.Sixteen })).resolves.toHaveLength(46);
});

test('throws on invalid duration', async () => {
	// @ts-expect-error
	await expect(lb.uploadFile({ path: testFilePath, duration: '36h' })).rejects.toThrowError(/Invalid duration /);
});

test('throws on invalid file name length', async () => {
	// @ts-expect-error
	await expect(lb.uploadFile({ path: testFilePath, fileNameLength: 10 })).rejects.toThrowError(/Invalid file name length /);
});

test('retries transient server errors', async () => {
	const originalFetch = global.fetch;
	const mockFetch = vi.fn()
		.mockResolvedValueOnce(new Response('temporary', { status: 503 }))
		.mockResolvedValueOnce(new Response('https://litter.catbox.moe/retried.png', { status: 200 }));

	vi.stubGlobal('fetch', mockFetch as typeof fetch);

	try {
		const stream = (async function* () {
			yield new Uint8Array([1, 2, 3]);
		})();

		await expect(lb.uploadFileStream({ stream, filename: 'test.bin' })).resolves.toContain('https://litter.catbox.moe/');
		expect(mockFetch).toHaveBeenCalledTimes(2);
	} finally {
		vi.stubGlobal('fetch', originalFetch);
	}
});
