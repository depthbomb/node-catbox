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
	skipNodeModulesBundle: false,
	target: 'esnext',
	tsconfig: './tsconfig.json',
	watch: options.watch,
	keepNames: false
}));
