import { Catbox } from '../dist/index.mjs';
import { vi, test, expect, afterEach } from 'vitest';

afterEach(() => {
	vi.unstubAllGlobals();
});

test.each(['Files successfully deleted.', 'Files successfully deleted.\r\n'])('accepts the deletion acknowledgement %j', async body => {
	vi.stubGlobal('fetch', vi.fn(async () => new Response(body)));
	await expect(new Catbox('test-user').deleteFiles({
		files: ['file.png']
	})).resolves.toBe(true);
});

test.each([
	'Files could not be deleted successfully',
	'Files unsuccessfully deleted.',
	'Files successfully deleted. Some files failed.',
	'Invalid user hash',
	''
])('rejects ambiguous or failed deletion response %j', async body => {
	vi.stubGlobal('fetch', vi.fn(async () => new Response(body)));
	await expect(new Catbox('test-user').deleteFiles({
		files: ['file.png']
	})).rejects.toThrow(body);
});
