import { basename } from 'node:path';
import { test, expect } from 'vitest';
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

test('uploads from file stream', async () => {
	await expect(lb.uploadFileStream({ stream: createReadStream(testFilePath), filename: basename(testFilePath) })).resolves.toContain('https://litter.catbox.moe/');
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
