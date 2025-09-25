// Flat ESLint config (ESLint v9+) unified for frontend + backend
// Using ESM (.mjs) so we can use import syntax.
import js from '@eslint/js'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import prettierPlugin from 'eslint-plugin-prettier'
import reactPlugin from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import noDirectTrackEventRule from './eslint-rules/no-direct-track-event.mjs'
import telemetryEventRule from './eslint-rules/telemetry-event-name.mjs'

export default [
    {
        // Unified ignore patterns (mirrors legacy .eslintrc and CJS flat variant)
        ignores: ['dist', '**/dist/**', 'node_modules', '**/.azure/**', '**/coverage/**']
    },
    js.configs.recommended,
    {
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: {parser: tsParser, ecmaVersion: 'latest', sourceType: 'module'},
        plugins: {
            '@typescript-eslint': tsPlugin,
            prettier: prettierPlugin,
            internal: {rules: {'telemetry-event-name': telemetryEventRule, 'no-direct-track-event': noDirectTrackEventRule}}
        },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            '@typescript-eslint/no-explicit-any': 'warn',
            'prettier/prettier': 'error',
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['**/dist/**'],
                            message: 'Import from source modules, not compiled dist output.'
                        }
                    ]
                }
            ],
            'internal/telemetry-event-name': 'error',
            'internal/no-direct-track-event': 'error'
        }
    },
    {
        files: ['frontend/src/**/*.{ts,tsx}'],
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
                HTMLInputElement: 'readonly',
                crypto: 'readonly',
                performance: 'readonly'
            }
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
            react: reactPlugin,
            'react-hooks': reactHooks,
            'jsx-a11y': jsxA11y
        },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            ...reactPlugin.configs.recommended.rules,
            ...reactHooks.configs.recommended.rules,
            ...jsxA11y.configs.recommended.rules,
            'react/prop-types': 'off',
            'react/react-in-jsx-scope': 'off',
            'react/jsx-uses-react': 'off',
            'arrow-parens': ['error', 'always'],
            'jsx-a11y/no-autofocus': 'warn',
            'jsx-a11y/anchor-is-valid': ['error', {aspects: ['noHref', 'invalidHref']}],
            '@typescript-eslint/no-explicit-any': 'warn'
        },
        settings: {react: {version: 'detect'}}
    },
    {
        // Frontend public API Azure Functions (node env but may share some TS conventions)
        files: ['frontend/api/src/**/*.ts'],
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {process: 'readonly'}
        },
        plugins: {'@typescript-eslint': tsPlugin},
        rules: {
            ...tsPlugin.configs.recommended.rules,
            '@typescript-eslint/no-explicit-any': 'warn'
        }
    },
    {
        // Backend Azure Functions (no React)
        files: ['backend/src/**/*.ts'],
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {process: 'readonly'}
        },
        plugins: {'@typescript-eslint': tsPlugin},
        rules: {
            ...tsPlugin.configs.recommended.rules,
            '@typescript-eslint/no-explicit-any': 'warn'
        }
    }
]
