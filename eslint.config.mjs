// Flat ESLint config (ESLint v9+) for root-level files only
// Backend, frontend, and shared packages have their own ESLint configs
import js from '@eslint/js'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import prettierPlugin from 'eslint-plugin-prettier'

export default [
    {
        // Ignore package directories - they have their own ESLint configs
        ignores: [
            'dist',
            '**/dist/**',
            'node_modules',
            '**/.azure/**',
            '**/coverage/**',
            'backend/**',
            'frontend/**',
            'shared/**'
        ]
    },
    js.configs.recommended,
    {
        // Root scripts (Node.js environment)
        files: ['scripts/**/*.{mjs,ts}', 'eslint-rules/**/*.mjs'],
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                process: 'readonly',
                console: 'readonly',
                crypto: 'readonly',
                Buffer: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                URL: 'readonly',
                performance: 'readonly'
            }
        },
        plugins: { '@typescript-eslint': tsPlugin, prettier: prettierPlugin },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': 'warn',
            'no-unused-vars': 'warn',
            'prettier/prettier': 'error'
        }
    }
]
