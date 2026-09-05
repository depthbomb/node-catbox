import { readFile } from 'node:fs/promises';
import { afterEach, expect, test, vi } from 'vitest';
import { Catbox, Litterbox } from '../dist/index.mjs';

type OperationCase = {
	name:           string;
	fields:         Record<string, string>;
	body:           string;
	result:         string | boolean;
	authenticated?: boolean;
	run: (client: Catbox) => Promise<unknown>;
};

const album = 'https://catbox.moe/c/abc123';
const operations = [
	{
		name: 'create album',
		fields: {
			reqtype: 'createalbum',
			title:   'Title',
			desc:    'Description',
			files:   'a.png b.png'
		},
		body:   album,
		result: album,
		run: (client: Catbox) => client.createAlbum({
			title:       'Title',
			description: 'Description',
			files:       ['a.png', 'b.png']
		})
	},
	{
		name: 'edit album',
		fields: {
			reqtype: 'editalbum',
			short:   'abc123',
			title:   'Changed',
			desc:    '',
			files:   'b.png a.png'
		},
		body:          album,
		result:        album,
		authenticated: true,
		run: (client: Catbox) => client.editAlbum({
			id:          'abc123',
			title:       'Changed',
			description: '',
			files:       ['b.png', 'a.png']
		})
	},
	{
		name: 'clear album',
		fields: {
			reqtype: 'editalbum',
			short:   'abc123',
			title:   '',
			desc:    ''
		},
		body:          album,
		result:        album,
		authenticated: true,
		run: (client: Catbox) => client.editAlbum({
			id:          'abc123',
			title:       '',
			description: '',
			files:       []
		})
	},
	{
		name: 'add album files',
		fields: {
			reqtype: 'addtoalbum',
			short:   'abc123',
			files:   'a.png b.png'
		},
		body:          album,
		result:        album,
		authenticated: true,
		run: (client: Catbox) => client.addFilesToAlbum({
			id:    'abc123',
			files: ['a.png', 'b.png']
		})
	},
	{
		name: 'remove album files',
		fields: {
			reqtype: 'removefromalbum',
			short:   'abc123',
			files:   'a.png b.png'
		},
		body:          album,
		result:        album,
		authenticated: true,
		run: (client: Catbox) => client.removeFilesFromAlbum({
			id:    'abc123',
			files: ['a.png', 'b.png']
		})
	},
	{
		name: 'delete album',
		fields: {
			reqtype: 'deletealbum',
			short:   'abc123'
		},
		body:          '',
		result:        true,
		authenticated: true,
		run: (client: Catbox) => client.removeAlbum({
			id: 'abc123'
		})
	},
	{
		name: 'delete files',
		fields: {
			reqtype: 'deletefiles',
			files:   'a.png b.png'
		},
		body:          'Files successfully deleted.',
		result:        true,
		authenticated: true,
		run: (client: Catbox) => client.deleteFiles({
			files: ['a.png', 'b.png']
		})
	}
] as OperationCase[];

afterEach(() => {
	vi.unstubAllGlobals();
});

test.each(operations)('$name sends the expected multipart fields', async operation => {
	const fetch = vi.fn(async (url: string, init: RequestInit) => {
		expect(url).toBe('https://catbox.moe/user/api.php');
		expect(init.method).toBe('POST');
		const form = await new Request(url, init).formData();
		expect(Object.fromEntries(form)).toEqual({
			...operation.fields,
			userhash: 'test-user'
		});

		return new Response(operation.body);
	});
	vi.stubGlobal('fetch', fetch);
	await expect(operation.run(new Catbox('test-user'))).resolves.toBe(operation.result);
	expect(fetch).toHaveBeenCalledTimes(1);
});

test.each(operations)('$name rejects service errors', async operation => {
	vi.stubGlobal('fetch', vi.fn(async () => new Response('Invalid request')));
	await expect(operation.run(new Catbox('test-user'))).rejects.toThrow('Invalid request');
});

test.each(operations)('$name does not replay an ambiguous gateway failure', async operation => {
	const fetch = vi.fn(async () => new Response(operation.body, {
		status: 502
	}));
	vi.stubGlobal('fetch', fetch);
	await expect(operation.run(new Catbox('test-user'))).rejects.toThrow('HTTP 502');
	expect(fetch).toHaveBeenCalledTimes(1);
});

test.each(operations.filter(operation => operation.authenticated))('$name requires authentication before sending', async operation => {
	const fetch = vi.fn();
	vi.stubGlobal('fetch', fetch);
	await expect(operation.run(new Catbox())).rejects.toThrow('A user hash is required');
	expect(fetch).not.toHaveBeenCalled();
});

test.each(['Catbox', 'Litterbox'])('%s serializes file contents and upload options', async name => {
	const bytes = await readFile('./tests/file.png');
	vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
		const form = await new Request(url, init).formData();
		const file = form.get('fileToUpload') as File;
		expect(file.name).toBe('file.png');
		expect(Buffer.from(await file.arrayBuffer())).toEqual(bytes);
		form.delete('fileToUpload');
		expect(Object.fromEntries(form)).toEqual(name === 'Catbox' ? {
			reqtype:  'fileupload',
			userhash: 'test-user'
		} : {
			reqtype:        'fileupload',
			time:           '72h',
			fileNameLength: '16'
		});

		return new Response(name === 'Catbox' ? 'https://files.catbox.moe/file.png' : 'https://litter.catbox.moe/file.png');
	}));
	if (name === 'Catbox') {
		await new Catbox('test-user').uploadFile({
			path: './tests/file.png'
		});
	} else {
		await new Litterbox().uploadFile({
			path:           './tests/file.png',
			duration:       '72h',
			fileNameLength: 16
		});
	}
});

test.each(['Catbox', 'Litterbox'])('%s preserves every supported chunk type with cancellation enabled', async name => {
	const backing = Uint8Array.from([99, 1, 2, 3, 99]);
	const chunks  = ['hello', Uint8Array.from([4, 5]).buffer, new DataView(backing.buffer, 1, 3), Buffer.from([6, 7]), 'é🐈'];
	const bytes   = Buffer.concat([Buffer.from('hello'), Buffer.from([4, 5, 1, 2, 3, 6, 7]), Buffer.from('é🐈')]);
	vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
		const form = await new Request(url, init).formData();
		const file = form.get('fileToUpload') as File;
		expect(file.name).toBe('stream.bin');
		expect(Buffer.from(await file.arrayBuffer())).toEqual(bytes);

		return new Response(name === 'Catbox' ? 'https://files.catbox.moe/file.bin' : 'https://litter.catbox.moe/file.bin');
	}));
	for (const web of [false, true]) {
		const client = name === 'Catbox' ? new Catbox() : new Litterbox();
		const stream = web ? new ReadableStream({
			start(controller) {
				for (const chunk of chunks) {
					controller.enqueue(chunk);
				}
				controller.close();
			}
		}) : (async function* () {
			yield* chunks;
		})();
		await client.uploadFileStream({
			stream,
			filename:       'stream.bin',
			maxStreamBytes: bytes.length,
			signal:         new AbortController().signal
		});
	}
});
