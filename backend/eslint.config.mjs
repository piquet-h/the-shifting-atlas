import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import prettierPlugin from 'eslint-plugin-prettier'
import azureFunctionNamingRule from '../eslint-rules/azure-function-naming.mjs'
import cosmosGremlinRepoConstructorRule from '../eslint-rules/cosmos-gremlin-repo-constructor.mjs'
import handlersMustExtendBaseRule from '../eslint-rules/handlers-must-extend-base.mjs'
import noDirectSecretAccessRule from '../eslint-rules/no-direct-secret-access.mjs'
import noDirectTrackEventRule from '../eslint-rules/no-direct-track-event.mjs'
import noRoomTelemetryRule from '../eslint-rules/no-room-telemetry.mjs'
import telemetryEventRule from '../eslint-rules/telemetry-event.mjs'
import telemetryInjectDecoratorRule from '../eslint-rules/telemetry-inject-decorator.mjs'

export default [
    { ignores: ['dist', '**/dist/**', 'node_modules', '**/coverage/**'] },
    {
        files: ['src/**/*.ts'],
        languageOptions: { parser: tsParser, ecmaVersion: 'latest', sourceType: 'module' },
        plugins: {
            '@typescript-eslint': tsPlugin,
            prettier: prettierPlugin,
            internal: {
                rules: {
                    'azure-function-naming': azureFunctionNamingRule,
                    'telemetry-event': telemetryEventRule,
                    'no-direct-track-event': noDirectTrackEventRule,
                    'no-room-telemetry': noRoomTelemetryRule,
                    'no-direct-secret-access': noDirectSecretAccessRule,
                    'handlers-must-extend-base': handlersMustExtendBaseRule,
                    'cosmos-gremlin-repo-constructor': cosmosGremlinRepoConstructorRule,
                    'telemetry-inject-decorator': telemetryInjectDecoratorRule
                }
            }
        },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            '@typescript-eslint/no-explicit-any': 'warn',
            'prettier/prettier': 'error',
            'internal/azure-function-naming': 'error',
            'internal/telemetry-event': 'error',
            'internal/no-direct-track-event': 'error',
            'internal/no-room-telemetry': 'error',
            'internal/no-direct-secret-access': 'error',
            'internal/handlers-must-extend-base': 'error',
            'internal/cosmos-gremlin-repo-constructor': 'error',
            'internal/telemetry-inject-decorator': 'error'
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
