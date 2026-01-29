import { defineConfig } from 'tsdown';

export default defineConfig({
	clean: true,
	entry: [
		'src/index.ts'
	],
	format: ['cjs', 'esm'],
	dts: true,
	minify: true,
	skipNodeModulesBundle: true,
	target: 'node22',
	exports: {
		packageJson: false
	},
	tsconfig: './tsconfig.json'
});
