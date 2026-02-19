import { config } from 'dotenv';
import { basename } from 'node:path';
import { Catbox } from '../dist/index.mjs';
import { createReadStream } from 'node:fs';
import { test, assert, expect, vi } from 'vitest';

config({ path: './.env' });

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === '1';
const cb = new Catbox();
const cb2 = new Catbox(process.env.USER_HASH!);
const testFileUrl = 'https://files.catbox.moe/6u9s4o.png';
const invalidFileUrl = 'www.website';
const invalidFileProtocolUrl = 'ftp://files.catbox.moe/6u9s4o.png';
const testFilePath = './tests/file.png';
const invalidFilePath = '../../../should/not/exist.exe';

test.runIf(runIntegrationTests)('uploads from file path', async () => {
	await expect(cb.uploadFile({ path: testFilePath })).resolves.toContain('https://files.catbox.moe/');
});

test.runIf(runIntegrationTests)('uploads from file stream', async () => {
	await expect(cb.uploadFileStream({ stream: createReadStream(testFilePath), filename: basename(testFilePath) })).resolves.toContain('https://files.catbox.moe/');
});

test('throws when stream exceeds max size', async () => {
	await expect(() => cb.uploadFileStream({
		stream: createReadStream(testFilePath),
		filename: basename(testFilePath),
		maxStreamBytes: 1
	})).rejects.toThrowError(/Stream exceeds maximum size /);
});

test('throws on invalid file path', async () => {
	await expect(() => cb.uploadFile({ path: invalidFilePath })).rejects.toThrowError(/Invalid file path /);
});

test('throws when file exceeds max size', async () => {
	await expect(() => cb.uploadFile({ path: testFilePath, maxFileBytes: 1 })).rejects.toThrowError(/File exceeds maximum size /);
});

test.runIf(runIntegrationTests)('uploads from direct file URL', async () => {
	await expect(cb.uploadURL({ url: testFileUrl })).resolves.toContain('https://files.catbox.moe/');
});

test('throws on invalid file URL', async () => {
	await expect(() => cb.uploadURL({ url: invalidFileUrl })).rejects.toThrowError(/Invalid URL /);
});

test('throws on invalid file URL protocol', async () => {
	await expect(() => cb.uploadURL({ url: invalidFileProtocolUrl })).rejects.toThrowError(/Invalid URL /);
});

test.runIf(runIntegrationTests)('creates an album', async () => {
	const uploadedFileUrl = await cb2.uploadFile({ path: testFilePath });
	const uploadedFileName = basename(uploadedFileUrl);

	assert(uploadedFileName.endsWith('.png'), 'Unexpected uploaded file extension');

	const albumUrl = await cb2.createAlbum({
		title: 'Test Album for node-catbox tests',
		description: 'This album was created as part of the node-catbox tests',
		files: [uploadedFileName]
	});

	expect(albumUrl).toContain('https://catbox.moe/c/');
});

test('retries transient server errors', async () => {
	const originalFetch = global.fetch;
	const mockFetch = vi.fn()
		.mockResolvedValueOnce(new Response('temporary', { status: 503 }))
		.mockResolvedValueOnce(new Response('https://files.catbox.moe/retried.png', { status: 200 }));

	vi.stubGlobal('fetch', mockFetch as typeof fetch);

	try {
		await expect(cb.uploadURL({ url: testFileUrl })).resolves.toContain('https://files.catbox.moe/');
		expect(mockFetch).toHaveBeenCalledTimes(2);
	} finally {
		vi.stubGlobal('fetch', originalFetch);
	}
});

test('request event does not expose raw body or userhash', async () => {
	const originalFetch = global.fetch;
	const mockFetch = vi.fn().mockResolvedValue(new Response('https://files.catbox.moe/safe.png', { status: 200 }));
	const sensitiveUserHash = 'sensitive-userhash-value';
	const secureCatbox = new Catbox(sensitiveUserHash);
	let requestSnapshot: unknown;

	secureCatbox.once('request', snapshot => {
		requestSnapshot = snapshot;
	});

	vi.stubGlobal('fetch', mockFetch as typeof fetch);

	try {
		await expect(secureCatbox.uploadURL({ url: testFileUrl })).resolves.toContain('https://files.catbox.moe/');
		expect(requestSnapshot).toBeTruthy();
		expect(requestSnapshot).toMatchObject({ method: 'POST', hasBody: true });
		expect(requestSnapshot).not.toHaveProperty('body');
		expect(JSON.stringify(requestSnapshot)).not.toContain(sensitiveUserHash);
	} finally {
		vi.stubGlobal('fetch', originalFetch);
	}
});
