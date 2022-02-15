import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
	clean: true,
	entry: [
		'src/index.ts',
		'src/test.ts',
	],
	format: ['cjs'],
	dts: true,
	minify: true,
	skipNodeModulesBundle: true,
	splitting: false,
	sourcemap: true,
	target: 'esnext',
	tsconfig: './tsconfig.json',
	watch: options.watch,
	keepNames: false,
}));
