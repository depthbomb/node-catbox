import { config } from 'dotenv';
import { basename } from 'node:path';
import { Catbox } from '../dist/index';
import { createReadStream } from 'node:fs';
import { test, assert, expect } from 'vitest';

config({ path: './.env' });

const cb = new Catbox();
const cb2 = new Catbox(process.env.USER_HASH!);
const testFileUrl = 'https://files.catbox.moe/6u9s4o.png';
const invalidFileUrl = 'www.website';
const testFilePath = './tests/file.png';
const invalidFilePath = '../../../should/not/exist.exe';

test('uploads from file path', async () => {
	await expect(cb.uploadFile({ path: testFilePath })).resolves.toContain('https://files.catbox.moe/');
});

test('uploads from file stream', async () => {
	await expect(cb.uploadFileStream({ stream: createReadStream(testFilePath), filename: basename(testFilePath) })).resolves.toContain('https://files.catbox.moe/');
});

test('throws on invalid file path', async () => {
	await expect(() => cb.uploadFile({ path: invalidFilePath })).rejects.toThrowError(/Invalid file path /);
});

test('uploads from direct file URL', async () => {
	await expect(cb.uploadURL({ url: testFileUrl })).resolves.toContain('https://files.catbox.moe/');
});

test('throws on invalid file URL', async () => {
	await expect(() => cb.uploadURL({ url: invalidFileUrl })).rejects.toThrow();
});

test('creates an album', async () => {
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
