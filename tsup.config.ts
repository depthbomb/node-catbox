import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
	clean: true,
	entry: [
		'src/index.ts',
		'src/test.ts',
	],
	format: ['cjs', 'esm'],
	dts: true,
	minify: true,
	noExternal: [
		'ohmyfetch',
		'formdata-node'
	],
	skipNodeModulesBundle: true,
	target: 'esnext',
	tsconfig: './tsconfig.json',
	splitting: true,
}));
