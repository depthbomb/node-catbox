<p align="center">
	<table>
		<tbody>
			<td align="center">
				<h1>node-catbox</h1>
				<p>A library for interacting with Catbox.moe written in TypeScript with no dependencies.</p>
				<p>
					<a href="https://www.npmjs.com/package/node-catbox"><img src="https://img.shields.io/npm/v/node-catbox?color=crimson&label=node-catbox&logo=npm"></a>
					<a href="https://www.npmjs.com/package/node-catbox"><img src="https://img.shields.io/npm/dt/node-catbox?color=crimson&logo=npm"></a>
					<a href="https://www.npmjs.com/package/node-catbox"><img src="https://img.shields.io/librariesio/release/npm/node-catbox?color=crimson&logo=npm"></a>
				</p>
				<p>
					<a href="https://github.com/depthbomb/node-catbox/releases/latest"><img src="https://img.shields.io/github/release-date/depthbomb/node-catbox.svg?label=Released&logo=github"></a>
					<a href="https://github.com/depthbomb/node-catbox/releases/latest"><img src="https://img.shields.io/github/release/depthbomb/node-catbox.svg?label=Stable&logo=github"></a>
					<a href="https://github.com/depthbomb/node-catbox"><img src="https://img.shields.io/github/repo-size/depthbomb/node-catbox.svg?label=Repo%20Size&logo=github"></a>
				</p>
				<img width="2000" height="0">
			</td>
		</tbody>
	</table>
</p>

This library aims to be a sort of successor to [https://www.npmjs.com/package/catbox.moe](https://www.npmjs.com/package/catbox.moe).

# Requirements

- \>= Node.js 22

# Installation

```sh
npm i node-catbox
yarn add node-catbox
bun add node-catbox
```

# Usage

### Uploading to Catbox

```ts
import { Catbox } from 'node-catbox';

const catbox = new Catbox();

try {
	const response = await catbox.uploadFile({
		path: '/path/to/my/file.ext'
	});
	// or to upload from direct file URL
	const response = await catbox.uploadURL({
		url: 'https://i.imgur.com/8rR6IZn.png'
	});

	console.log(response); // -> https://files.catbox.moe/XXXXX.ext
} catch (err) {
	console.error(err); // -> error message from server
}

// ---

// NEW in v3.4.0

const stream = createReadStream('/path/to/my/file.ext');
await catbox.uploadFileStream({
	stream,
	filename: 'file.ext'
});
```

### User Hash

Some operations require your account's user hash which can be set on instantiation with
```ts
const catbox = new Catbox('098f6bcd4621d373cade4e832');
```
... or later with
```ts
const catbox = new Catbox();

const catbox.setUserHash('098f6bcd4621d373cade4e832');
```

### Deleting Files

```ts
import { Catbox } from 'node-catbox';

// user hash required
const catbox = new Catbox('098f6bcd4621d373cade4e832');

await catbox.deleteFiles({
	files: ['XXXXX.ext']
});
```

### Creating an album

```ts
import { Catbox } from 'node-catbox';

// user hash only required if you plan to edit or delete the album later
const catbox = new Catbox('098f6bcd4621d373cade4e832');

const albumURL = await catbox.createAlbum({
	title: 'album title',
	description: 'album description',
	files: ['XXXXX.ext'] // optional
});
```

### Editing an album

```ts
import { Catbox } from 'node-catbox';

// user hash required
const catbox = new Catbox('098f6bcd4621d373cade4e832');

await catbox.editAlbum({
	id: 'YYYYY',
	title: 'new title',
	description: 'new description',
	files:  ['WWWWW.ext', 'VVVVV.ext'] // optional
});
```

> **Warning**
> This is a potentially destructive method where values are applied to the album directly. Consider using the method below if you are only adding/removing files from an album.

### Adding and removing files from an album

```ts
import { Catbox } from 'node-catbox';

// user hash required
const catbox = new Catbox('098f6bcd4621d373cade4e832');

await catbox.addFilesToAlbum({
	id: 'YYYYY',
	files: ['ZZZZZ.ext']
});
await catbox.removeFilesFromAlbum({
	id: 'YYYYY',
	files: ['ZZZZZ.ext']
});
```

### Deleting an album

```ts
import { Catbox } from 'node-catbox';

// user hash required
const catbox = new Catbox('098f6bcd4621d373cade4e832');

await catbox.deleteAlbum({
	id: 'YYYYY'
});
```

### Uploading to Litterbox

```ts
import { Litterbox } from 'node-catbox';

const litterbox = new Litterbox();

await litterbox.uploadFile({
	path: '/path/to/my/file.ext',
	duration: '12h' // or omit to default to 1h
});

// ---

import { FileLifetime } from 'node-catbox';

// Using an enum for duration
await litterbox.uploadFile({
	path: '/path/to/my/file.ext',
	duration: FileLifetime.TwelveHours
});

// ---

// NEW in v3.4.0

const stream = createReadStream('/path/to/my/file.ext');
await litterbox.uploadFileStream({
	stream,
	filename: 'file.ext'
});

// ---

// NEW in v4.1.0

import { FileNameLength } from 'node-catbox';

// Using an enum for duration
await litterbox.uploadFile({
	path: '/path/to/my/file.ext',
	fileNameLength: FileNameLength.Sixteen
});
```

# Events

As of 4.0.0, both `Catbox` and `Litterbox` emit a `request` and `response` event as well as events specific to each class:

```ts
import { Catbox, Litterbox } from 'node-catbox';

const catbox    = new Catbox();
const litterbox = new Litterbox();

catbox.on('request',  requestInit => console.log(requestInit.method));
catbox.on('response', response    => console.log(`${response.status} - ${response.statusText}`));

litterbox.on('uploadingFile', (filepath, duration) => console.log('Uploading file', filepath, 'with a duration of', duration));
```

# Testing

Before you test the library you need to provide your Catbox account's user hash. Create a `.env` file in the project root and set the `USER_HASH` value to your account's user hash.

---

## Use of AI Tools

This project does **not** include any source code generated by artificial intelligence tools. All application logic, implementation, and architectural decisions are authored and maintained by human contributors, flaws and all.

AI tools **may** be used in a limited, non-code capacity to assist with:

- Grammar and spelling checks
- Wording improvements for documentation
- Changelog entry refinement
- README and other markdown documentation editing

No AI-generated content is used for:

- Application source code
- Build scripts or tooling
- Configuration logic

Any use of AI is strictly limited to improving clarity and readability of written documentation, and all changes are reviewed before being committed.
