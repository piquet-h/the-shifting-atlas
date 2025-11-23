import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import prettierPlugin from 'eslint-plugin-prettier'
import reactPlugin from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import noDirectSecretAccessRule from '../eslint-rules/no-direct-secret-access.mjs'
import noDirectTrackEventRule from '../eslint-rules/no-direct-track-event.mjs'
import noRoomTelemetryRule from '../eslint-rules/no-room-telemetry.mjs'
import telemetryEventRule from '../eslint-rules/telemetry-event.mjs'

export default [
    { ignores: ['dist', '**/dist/**', 'node_modules', '**/coverage/**'] },
    {
        files: ['src/**/*.{ts,tsx}'],
        languageOptions: { parser: tsParser, ecmaVersion: 'latest', sourceType: 'module' },
        plugins: {
            '@typescript-eslint': tsPlugin,
            react: reactPlugin,
            'react-hooks': reactHooks,
            'jsx-a11y': jsxA11y,
            prettier: prettierPlugin,
            internal: {
                rules: {
                    'telemetry-event': telemetryEventRule,
                    'no-direct-track-event': noDirectTrackEventRule,
                    'no-room-telemetry': noRoomTelemetryRule,
                    'no-direct-secret-access': noDirectSecretAccessRule
                }
            }
        },
        settings: { react: { version: 'detect' } },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            ...reactPlugin.configs.recommended.rules,
            ...reactHooks.configs.recommended.rules,
            ...jsxA11y.configs.recommended.rules,
            'react/prop-types': 'off',
            'react/react-in-jsx-scope': 'off',
            'react/jsx-uses-react': 'off',
            '@typescript-eslint/no-explicit-any': 'warn',
            'prettier/prettier': 'error',
            'internal/telemetry-event': 'error',
            'internal/no-direct-track-event': 'error',
            'internal/no-room-telemetry': 'error',
            'internal/no-direct-secret-access': 'error'
        }
    },
    {
        files: ['test/**/*.{ts,tsx}'],
        languageOptions: { parser: tsParser, ecmaVersion: 'latest', sourceType: 'module' },
        plugins: {
            '@typescript-eslint': tsPlugin,
            react: reactPlugin,
            prettier: prettierPlugin
        },
        settings: { react: { version: 'detect' } },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            ...reactPlugin.configs.recommended.rules,
            'react/prop-types': 'off',
            'react/react-in-jsx-scope': 'off',
            'react/jsx-uses-react': 'off',
            '@typescript-eslint/no-explicit-any': 'warn',
            'prettier/prettier': 'error'
        }
    }
]
