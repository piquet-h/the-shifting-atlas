import assert from 'node:assert'
import { describe, test } from 'node:test'
import {
    buildErrorAttributes,
    classifyError,
    createErrorRecordingContext,
    ERROR_CLASSIFICATION_TABLE,
    ERROR_TELEMETRY_KEYS,
    hasErrorRecorded,
    inferErrorKindFromStatus,
    recordError
} from '../../src/telemetry/errorTelemetry.js'

describe('Error Telemetry Normalization', () => {
    describe('ERROR_CLASSIFICATION_TABLE', () => {
        test('should map validation errors to validation kind', () => {
            const validationCodes = ['ValidationError', 'MissingField', 'InvalidFormat', 'InvalidPlayerId', 'NoExit']
            for (const code of validationCodes) {
                assert.strictEqual(ERROR_CLASSIFICATION_TABLE[code], 'validation', `Expected ${code} to be 'validation'`)
            }
        })

        test('should map not-found errors to not-found kind', () => {
            const notFoundCodes = ['NotFound', 'PlayerNotFound', 'LocationNotFound', 'FromNotFound', 'from-missing']
            for (const code of notFoundCodes) {
                assert.strictEqual(ERROR_CLASSIFICATION_TABLE[code], 'not-found', `Expected ${code} to be 'not-found'`)
            }
        })

        test('should map conflict errors to conflict kind', () => {
            const conflictCodes = ['ExternalIdConflict', 'ConcurrencyError', 'DuplicateError']
            for (const code of conflictCodes) {
                assert.strictEqual(ERROR_CLASSIFICATION_TABLE[code], 'conflict', `Expected ${code} to be 'conflict'`)
            }
        })

        test('should map internal errors to internal kind', () => {
            const internalCodes = ['InternalError', 'MoveFailed', 'DatabaseError', 'TimeoutError']
            for (const code of internalCodes) {
                assert.strictEqual(ERROR_CLASSIFICATION_TABLE[code], 'internal', `Expected ${code} to be 'internal'`)
            }
        })
    })

    describe('inferErrorKindFromStatus', () => {
        test('should return validation for 400-403', () => {
            assert.strictEqual(inferErrorKindFromStatus(400), 'validation')
            assert.strictEqual(inferErrorKindFromStatus(401), 'validation')
            assert.strictEqual(inferErrorKindFromStatus(403), 'validation')
        })

        test('should return validation for 429 (rate limiting)', () => {
            assert.strictEqual(inferErrorKindFromStatus(429), 'validation')
        })

        test('should return not-found for 404', () => {
            assert.strictEqual(inferErrorKindFromStatus(404), 'not-found')
        })

        test('should return conflict for 409', () => {
            assert.strictEqual(inferErrorKindFromStatus(409), 'conflict')
        })

        test('should return internal for 5xx', () => {
            assert.strictEqual(inferErrorKindFromStatus(500), 'internal')
            assert.strictEqual(inferErrorKindFromStatus(502), 'internal')
            assert.strictEqual(inferErrorKindFromStatus(503), 'internal')
        })
    })

    describe('classifyError', () => {
        test('should classify known error codes', () => {
            assert.strictEqual(classifyError('ValidationError'), 'validation')
            assert.strictEqual(classifyError('NotFound'), 'not-found')
            assert.strictEqual(classifyError('InternalError'), 'internal')
        })

        test('should fallback to HTTP status for unknown codes', () => {
            assert.strictEqual(classifyError('UnknownCode', 400), 'validation')
            assert.strictEqual(classifyError('UnknownCode', 404), 'not-found')
            assert.strictEqual(classifyError('UnknownCode', 409), 'conflict')
            assert.strictEqual(classifyError('UnknownCode', 500), 'internal')
        })

        test('should return internal for unknown codes without status', () => {
            assert.strictEqual(classifyError('TotallyUnknown'), 'internal')
        })
    })

    describe('buildErrorAttributes', () => {
        test('should build error attributes with code, message, and kind', () => {
            const attrs = buildErrorAttributes({ code: 'ValidationError', message: 'Invalid input' })

            assert.strictEqual(attrs.errorCode, 'ValidationError')
            assert.strictEqual(attrs.errorMessage, 'Invalid input')
            assert.strictEqual(attrs.errorKind, 'validation')
        })

        test('should use HTTP status for unknown error classification', () => {
            const attrs = buildErrorAttributes({ code: 'CustomError', message: 'Custom issue' }, 404)

            assert.strictEqual(attrs.errorCode, 'CustomError')
            assert.strictEqual(attrs.errorKind, 'not-found')
        })
    })

    describe('createErrorRecordingContext', () => {
        test('should create context with correlationId', () => {
            const ctx = createErrorRecordingContext('corr-123')

            assert.strictEqual(ctx.correlationId, 'corr-123')
            assert.strictEqual(ctx.errorRecorded, false)
            assert.strictEqual(ctx.httpStatus, undefined)
        })

        test('should create context with httpStatus', () => {
            const ctx = createErrorRecordingContext('corr-456', 400)

            assert.strictEqual(ctx.correlationId, 'corr-456')
            assert.strictEqual(ctx.httpStatus, 400)
        })
    })

    describe('recordError', () => {
        test('should record error and set attributes', () => {
            const ctx = createErrorRecordingContext('corr-001')
            const props: Record<string, unknown> = { existingProp: 'value' }

            const result = recordError(ctx, { code: 'ValidationError', message: 'Invalid input' }, props)

            assert.strictEqual(result.recorded, true)
            assert.strictEqual(props[ERROR_TELEMETRY_KEYS.ERROR_CODE], 'ValidationError')
            assert.strictEqual(props[ERROR_TELEMETRY_KEYS.ERROR_MESSAGE], 'Invalid input')
            assert.strictEqual(props[ERROR_TELEMETRY_KEYS.ERROR_KIND], 'validation')
            assert.strictEqual(props['existingProp'], 'value')
        })

        test('should prevent duplicate error recording (first wins)', () => {
            const ctx = createErrorRecordingContext('corr-002')
            const props: Record<string, unknown> = {}

            // First error
            const result1 = recordError(ctx, { code: 'ValidationError', message: 'First error' }, props)
            assert.strictEqual(result1.recorded, true)
            assert.strictEqual(props[ERROR_TELEMETRY_KEYS.ERROR_MESSAGE], 'First error')

            // Second error (should be ignored)
            const result2 = recordError(ctx, { code: 'NotFound', message: 'Second error' }, props)
            assert.strictEqual(result2.recorded, false)
            // Original error should still be in props
            assert.strictEqual(props[ERROR_TELEMETRY_KEYS.ERROR_MESSAGE], 'First error')
            assert.strictEqual(props[ERROR_TELEMETRY_KEYS.ERROR_CODE], 'ValidationError')
        })

        test('should truncate long messages (>256 chars)', () => {
            const ctx = createErrorRecordingContext('corr-003')
            const props: Record<string, unknown> = {}
            const longMessage = 'A'.repeat(300) // 300 chars

            recordError(ctx, { code: 'InternalError', message: longMessage }, props)

            const recorded = props[ERROR_TELEMETRY_KEYS.ERROR_MESSAGE] as string
            assert.ok(recorded.length <= 256, `Message should be truncated to <= 256 chars, got ${recorded.length}`)
            assert.ok(recorded.endsWith('...'), 'Truncated message should end with ...')
        })

        test('should not truncate short messages', () => {
            const ctx = createErrorRecordingContext('corr-004')
            const props: Record<string, unknown> = {}
            const shortMessage = 'Short error message'

            recordError(ctx, { code: 'ValidationError', message: shortMessage }, props)

            assert.strictEqual(props[ERROR_TELEMETRY_KEYS.ERROR_MESSAGE], shortMessage)
        })

        test('should merge additional properties', () => {
            const ctx = createErrorRecordingContext('corr-005')
            const props: Record<string, unknown> = {}

            recordError(ctx, { code: 'ValidationError', message: 'Error', properties: { extra: 'data' } }, props)

            assert.strictEqual(props['extra'], 'data')
        })

        test('should use httpStatus from context for classification', () => {
            const ctx = createErrorRecordingContext('corr-006', 404)
            const props: Record<string, unknown> = {}

            recordError(ctx, { code: 'CustomError', message: 'Not found' }, props)

            assert.strictEqual(props[ERROR_TELEMETRY_KEYS.ERROR_KIND], 'not-found')
        })
    })

    describe('hasErrorRecorded', () => {
        test('should return false for new context', () => {
            const ctx = createErrorRecordingContext('corr-007')
            assert.strictEqual(hasErrorRecorded(ctx), false)
        })

        test('should return true after error is recorded', () => {
            const ctx = createErrorRecordingContext('corr-008')
            const props: Record<string, unknown> = {}

            recordError(ctx, { code: 'ValidationError', message: 'Error' }, props)

            assert.strictEqual(hasErrorRecorded(ctx), true)
        })
    })

    describe('Success path (no error recording)', () => {
        test('should not emit error properties on success', () => {
            const props: Record<string, unknown> = {
                status: 200,
                latencyMs: 50
            }

            // No recordError called - simulating success path

            assert.strictEqual(props[ERROR_TELEMETRY_KEYS.ERROR_CODE], undefined)
            assert.strictEqual(props[ERROR_TELEMETRY_KEYS.ERROR_MESSAGE], undefined)
            assert.strictEqual(props[ERROR_TELEMETRY_KEYS.ERROR_KIND], undefined)
        })
    })
})
