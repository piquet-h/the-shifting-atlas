// Flat ESLint config (ESLint v9+) unified for frontend + backend
// CommonJS variant (use the .mjs version for ESM tooling if desired)
const js = require('@eslint/js');
const jsxA11y = require('eslint-plugin-jsx-a11y');
const reactPlugin = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');
const ts = require('typescript-eslint');

module.exports = [
    {
        ignores: ['dist', '**/dist/**', 'node_modules', '**/.azure/**', '**/coverage/**'],
    },
    // Base JS + TS recommended
    js.configs.recommended,
    ...ts.configs.recommended,
    // Frontend React overrides
    {
        files: ['frontend/src/**/*.{ts,tsx}', 'frontend/api/src/**/*.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
        },
        plugins: {
            react: reactPlugin,
            'react-hooks': reactHooks,
            'jsx-a11y': jsxA11y,
        },
        rules: {
            ...reactPlugin.configs.recommended.rules,
            ...reactHooks.configs.recommended.rules,
            ...jsxA11y.configs.recommended.rules,
            'react/prop-types': 'off',
            'jsx-a11y/no-autofocus': 'warn',
            'jsx-a11y/anchor-is-valid': ['error', { aspects: ['noHref', 'invalidHref'] }],
            '@typescript-eslint/no-explicit-any': 'warn',
            // Indentation handled by Prettier (4 spaces configured). ESLint indent rule removed to avoid recursion issues.
        },
        settings: { react: { version: 'detect' } },
    },
    // Backend Azure Functions (Node env, no React)
    {
        files: ['backend/src/**/*.ts'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'warn',
            // Indentation handled by Prettier.
        },
    },
];
