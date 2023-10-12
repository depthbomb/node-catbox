import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
	clean: true,
	entry: [
		'src/index.ts',
		'src/test.ts',
	],
	format: ['cjs', 'esm'],
	dts: true,
	minify: 'terser',
	skipNodeModulesBundle: true,
	target: 'node19',
	tsconfig: './tsconfig.json',
	splitting: true,
}));
