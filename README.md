<p align="center">
	<table>
		<tbody>
			<td align="center">
				<h1>node-catbox</h1>
				<p>A library for interacting with Catbox.moe written in TypeScript.</p>
				<p>
					<a href="https://www.npmjs.com/package/node-catbox"><img src="https://img.shields.io/npm/v/node-catbox?color=crimson&label=node-catbox&logo=npm&style=flat-square"></a>
					<a href="https://www.npmjs.com/package/node-catbox"><img src="https://img.shields.io/npm/dt/node-catbox?color=crimson&logo=npm&style=flat-square"></a>
					<a href="https://www.npmjs.com/package/node-catbox"><img src="https://img.shields.io/librariesio/release/npm/node-catbox?color=crimson&logo=npm&style=flat-square"></a>
				</p>
				<p>
					<a href="https://github.com/depthbomb/node-catbox/releases/latest"><img src="https://img.shields.io/github/release-date/depthbomb/node-catbox.svg?label=Released&logo=github&style=flat-square"></a>
					<a href="https://github.com/depthbomb/node-catbox/releases/latest"><img src="https://img.shields.io/github/release/depthbomb/node-catbox.svg?label=Stable&logo=github&style=flat-square"></a>
					<a href="https://github.com/depthbomb/node-catbox"><img src="https://img.shields.io/github/repo-size/depthbomb/node-catbox.svg?label=Repo%20Size&logo=github&style=flat-square"></a>
				</p>
				<p>
					<a href='https://ko-fi.com/O4O1DV77' target='_blank'><img height='36' src='https://cdn.ko-fi.com/cdn/kofi1.png?v=3' alt='Buy Me a Coffee at ko-fi.com' /></a>
				</p>
				<img width="2000" height="0">
			</td>
		</tbody>
	</table>
</p>

This library aims to be a sort of successor to [https://www.npmjs.com/package/catbox.moe](https://www.npmjs.com/package/catbox.moe).

# Installation

```sh
npm i node-catbox

# or

yarn add node-catbox
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

### Uploading to Litterbox

```ts
import { Litterbox } from 'node-catbox';

const litterbox = new Litterbox();

await litterbox.upload({
	path: '/path/to/my/file.ext',
	duration: '12h' // or omit to default to 1h
});
```

### Creating an album

```ts
import { Catbox } from 'node-catbox';

// user hash only required if you plan to edit or delete the album later
const catbox = new Catbox('098f6bcd4621d373cade4e832');

const albumURL = await catbox.createAlbum({
	title: 'album title',
	description: 'album description', // optional
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
	description: 'new description', // optional
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
