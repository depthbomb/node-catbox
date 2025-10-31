import { defineConfig } from 'tsdown';

export default defineConfig((options) => ({
	clean: true,
	entry: [
		'src/index.ts',
	],
	format: ['cjs', 'esm'],
	dts: true,
	minify: true,
	skipNodeModulesBundle: true,
	target: 'node19',
	tsconfig: './tsconfig.json',
	splitting: true,
}));
