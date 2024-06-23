import { test, expect } from 'vitest';
import { Litterbox } from '../dist/index';

const lb = new Litterbox();
const testFilePath = './tests/file.png';
const invalidFilePath = '../../../should/not/exist.exe';

test('uploads from file path', async () => {
	await expect(lb.upload({ path: testFilePath })).resolves.toContain('https://litter.catbox.moe/');
});

test('throws on invalid file path', async () => {
	await expect(() => lb.upload({ path: invalidFilePath })).rejects.toThrowError(/Invalid file path /);
});

test('uploads with defined duration', async () => {
	await expect(lb.upload({ path: testFilePath, duration: '1h' })).resolves.toContain('https://litter.catbox.moe/');
	await expect(lb.upload({ path: testFilePath, duration: '12h' })).resolves.toContain('https://litter.catbox.moe/');
	await expect(lb.upload({ path: testFilePath, duration: '24h' })).resolves.toContain('https://litter.catbox.moe/');
	await expect(lb.upload({ path: testFilePath, duration: '72h' })).resolves.toContain('https://litter.catbox.moe/');
});

test('throws on invalid duration', async () => {
	await expect(lb.upload({ path: testFilePath, duration: '36h' })).rejects.toThrowError(/Invalid duration /);
});
