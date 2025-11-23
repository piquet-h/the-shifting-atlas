import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import prettierPlugin from 'eslint-plugin-prettier'
import noDirectSecretAccessRule from '../eslint-rules/no-direct-secret-access.mjs'
import noDirectTrackEventRule from '../eslint-rules/no-direct-track-event.mjs'
import noInlineHumorEventsRule from '../eslint-rules/no-inline-humor-events.mjs'
import noRoomTelemetryRule from '../eslint-rules/no-room-telemetry.mjs'
import telemetryEventRule from '../eslint-rules/telemetry-event.mjs'

export default [
    {
        ignores: ['dist', '**/dist/**', 'node_modules', '**/coverage/**']
    },
    {
        files: ['src/**/*.ts'],
        languageOptions: { parser: tsParser, ecmaVersion: 'latest', sourceType: 'module' },
        plugins: {
            '@typescript-eslint': tsPlugin,
            prettier: prettierPlugin,
            internal: {
                rules: {
                    'telemetry-event': telemetryEventRule,
                    'no-direct-track-event': noDirectTrackEventRule,
                    'no-room-telemetry': noRoomTelemetryRule,
                    'no-inline-humor-events': noInlineHumorEventsRule,
                    'no-direct-secret-access': noDirectSecretAccessRule
                }
            }
        },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            '@typescript-eslint/no-explicit-any': 'warn',
            'prettier/prettier': 'error',
            'internal/telemetry-event': 'error',
            'internal/no-direct-track-event': 'error',
            'internal/no-room-telemetry': 'error',
            'internal/no-inline-humor-events': 'error',
            'internal/no-direct-secret-access': 'error'
        }
    },
    {
        files: ['test/**/*.ts'],
        languageOptions: { parser: tsParser, ecmaVersion: 'latest', sourceType: 'module' },
        plugins: {
            '@typescript-eslint': tsPlugin,
            prettier: prettierPlugin
        },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            '@typescript-eslint/no-explicit-any': 'warn',
            'prettier/prettier': 'error'
        }
    }
]
