import { defineConfig, globalIgnores } from "eslint/config";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
	baseDirectory: __dirname,
	recommendedConfig: js.configs.recommended,
	allConfig: js.configs.all
});

export default defineConfig([globalIgnores(["**/dist", "**/node_modules"]), {
	extends: compat.extends("eslint:recommended", "plugin:@typescript-eslint/recommended"),

	plugins: {
		"@typescript-eslint": typescriptEslint,
	},

	languageOptions: {
		globals: {
			...globals.node,
			NodeJS: true,
		},

		parser: tsParser,
	},

	rules: {
		eqeqeq: "error",
		"eol-last": "warn",
		"no-undef": "warn",
		"no-empty": "warn",
		"dot-notation": "error",
		"no-useless-escape": "off",
		"no-mixed-spaces-and-tabs": "off",
		"@typescript-eslint/no-extra-semi": "off",
		"@typescript-eslint/ban-ts-comment": "warn",
		"@typescript-eslint/no-var-requires": "warn",
		"@typescript-eslint/no-empty-function": "off",
		"@typescript-eslint/no-inferrable-types": "off",
		"@typescript-eslint/no-unused-vars": "warn",
	},
}]);
