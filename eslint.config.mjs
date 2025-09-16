// Flat ESLint config (ESLint v9+) unified for frontend + backend
// Using ESM (.mjs) so we can use import syntax.
import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettierPlugin from 'eslint-plugin-prettier';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
    {
        // Unified ignore patterns (mirrors legacy .eslintrc and CJS flat variant)
        ignores: ['dist', '**/dist/**', 'node_modules', '**/.azure/**', '**/coverage/**'],
    },
    js.configs.recommended,
    {
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: { parser: tsParser, ecmaVersion: 'latest', sourceType: 'module' },
        plugins: { '@typescript-eslint': tsPlugin, prettier: prettierPlugin },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            '@typescript-eslint/no-explicit-any': 'warn',
            // Indentation enforced by Prettier (tabWidth 4)
            'prettier/prettier': 'error',
        },
    },
    {
        files: ['frontend/src/**/*.{ts,tsx}', 'frontend/api/src/**/*.{ts,tsx}'],
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                document: 'readonly',
                window: 'readonly',
                fetch: 'readonly',
                HTMLElement: 'readonly',
                HTMLHeadingElement: 'readonly',
                HTMLDivElement: 'readonly',
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
            react: reactPlugin,
            'react-hooks': reactHooks,
            'jsx-a11y': jsxA11y,
        },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            ...reactPlugin.configs.recommended.rules,
            ...reactHooks.configs.recommended.rules,
            ...jsxA11y.configs.recommended.rules,
            'react/prop-types': 'off',
            'jsx-a11y/no-autofocus': 'warn',
            'jsx-a11y/anchor-is-valid': ['error', { aspects: ['noHref', 'invalidHref'] }],
            '@typescript-eslint/no-explicit-any': 'warn',
            // Indentation via Prettier
        },
        settings: { react: { version: 'detect' } },
    },
    {
        // Backend Azure Functions (no React)
        files: ['backend/src/**/*.ts'],
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { process: 'readonly' },
        },
        plugins: { '@typescript-eslint': tsPlugin },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            '@typescript-eslint/no-explicit-any': 'warn',
        },
    },
];
