// Flat ESLint config (ESLint v9+) unified for frontend + backend
// Using ESM (.mjs) so we can use import syntax.
import js from '@eslint/js'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import importPlugin from 'eslint-plugin-import'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import prettierPlugin from 'eslint-plugin-prettier'
import reactPlugin from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import noDirectSecretAccessRule from './eslint-rules/no-direct-secret-access.mjs'
import noDirectTrackEventRule from './eslint-rules/no-direct-track-event.mjs'
import noRawPaginationLoopRule from './eslint-rules/no-raw-pagination-loop.mjs'
import noRoomTelemetryRule from './eslint-rules/no-room-telemetry.mjs'
import telemetryEventRule from './eslint-rules/telemetry-event-name.mjs'

export default [
    {
        // Unified ignore patterns (mirrors legacy .eslintrc and CJS flat variant)
        ignores: ['dist', '**/dist/**', 'node_modules', '**/.azure/**', '**/coverage/**']
    },
    js.configs.recommended,
    {
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: { parser: tsParser, ecmaVersion: 'latest', sourceType: 'module' },
        plugins: {
            '@typescript-eslint': tsPlugin,
            prettier: prettierPlugin,
            import: importPlugin,
            internal: {
                rules: {
                    'telemetry-event-name': telemetryEventRule,
                    'no-direct-track-event': noDirectTrackEventRule,
                    'no-room-telemetry': noRoomTelemetryRule,
                    'no-direct-secret-access': noDirectSecretAccessRule,
                    'no-raw-pagination-loop': noRawPaginationLoopRule
                }
            }
        },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            '@typescript-eslint/no-explicit-any': 'warn',
            'prettier/prettier': 'error',
            // Enforce consistent import grouping/alphabetization for TS (soft fail: warn)
            'import/order': [
                'warn',
                {
                    groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'object', 'type'],
                    'newlines-between': 'always',
                    alphabetize: { order: 'asc', caseInsensitive: true }
                }
            ],
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
            'internal/no-direct-track-event': 'error',
            'internal/no-room-telemetry': 'error',
            'internal/no-direct-secret-access': 'error',
            'internal/no-raw-pagination-loop': 'error'
        }
    },
    {
        // Shared package (Node.js environment)
        files: ['shared/src/**/*.ts'],
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { process: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly' }
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
            prettier: prettierPlugin
        },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            '@typescript-eslint/no-explicit-any': 'warn',
            'prettier/prettier': 'error',
            'internal/telemetry-event-name': 'error',
            'internal/no-direct-track-event': 'error',
            'internal/no-room-telemetry': 'error',
            'internal/no-direct-secret-access': 'error',
            'internal/no-raw-pagination-loop': 'error'
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
            'jsx-a11y/no-autofocus': 'warn',
            'jsx-a11y/anchor-is-valid': ['error', { aspects: ['noHref', 'invalidHref'] }],
            '@typescript-eslint/no-explicit-any': 'warn'
        },
        settings: { react: { version: 'detect' } }
    },
    {
        // Frontend public API Azure Functions (node env but may share some TS conventions)
        files: ['frontend/api/src/**/*.ts'],
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { process: 'readonly' }
        },
        plugins: { '@typescript-eslint': tsPlugin },
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
            globals: { process: 'readonly' }
        },
        plugins: { '@typescript-eslint': tsPlugin },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            '@typescript-eslint/no-explicit-any': 'warn'
        }
    },
    {
        // Automation / maintenance scripts (MJS) - ensure Prettier + internal rules + import ordering
        files: ['scripts/**/*.mjs'],
        languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        plugins: {
            prettier: prettierPlugin,
            import: importPlugin,
            internal: {
                rules: {
                    'telemetry-event-name': telemetryEventRule,
                    'no-direct-track-event': noDirectTrackEventRule,
                    'no-room-telemetry': noRoomTelemetryRule,
                    'no-direct-secret-access': noDirectSecretAccessRule,
                    'no-raw-pagination-loop': noRawPaginationLoopRule
                }
            }
        },
        rules: {
            'prettier/prettier': 'error',
            'import/order': [
                'warn',
                {
                    groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'object'],
                    'newlines-between': 'always',
                    alphabetize: { order: 'asc', caseInsensitive: true }
                }
            ],
            'internal/no-raw-pagination-loop': 'error',
            // Relax legacy script issues; focus on pagination + formatting enforcement first.
            'no-redeclare': 'off',
            'no-undef': 'off',
            'no-unused-vars': 'off'
        }
    }
]
