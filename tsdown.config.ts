import { defineConfig } from 'tsdown';

export default defineConfig({
	clean: true,
	entry: [
		'src/index.ts'
	],
	format: ['cjs', 'esm'],
	dts: true,
	minify: true,
	deps: {
		neverBundle: true
	},
	target: 'node24',
	exports: {
		packageJson: false,
		customExports: {
			'.': {
				types: {
					import: './dist/index.d.mts',
					require: './dist/index.d.cts'
				},
				import: './dist/index.mjs',
				require: './dist/index.cjs'
			}
		}
	},
	tsconfig: './tsconfig.json'
});
