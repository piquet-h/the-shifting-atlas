import assert from 'node:assert'
import { describe, test } from 'node:test'
import {
    errorResponse,
    formatError,
    formatValidationErrors,
    internalErrorResponse,
    validationErrorResponse,
    type ValidationErrorItem
} from '../../src/http/errorEnvelope.js'

describe('Error Envelope Utility', () => {
    describe('formatError', () => {
        test('should format a single error with code and message', () => {
            const result = formatError('NotFound', 'Resource not found')

            assert.deepStrictEqual(result, {
                success: false,
                error: { code: 'NotFound', message: 'Resource not found' },
                correlationId: undefined
            })
        })

        test('should include correlationId when provided', () => {
            const correlationId = 'test-correlation-123'
            const result = formatError('ValidationError', 'Invalid input', correlationId)

            assert.deepStrictEqual(result, {
                success: false,
                error: { code: 'ValidationError', message: 'Invalid input' },
                correlationId
            })
        })

        test('should handle domain-specific error codes', () => {
            const result = formatError('MissingPlayerId', 'Player ID is required', 'corr-456')

            assert.strictEqual(result.success, false)
            assert.strictEqual(result.error.code, 'MissingPlayerId')
            assert.strictEqual(result.error.message, 'Player ID is required')
            assert.strictEqual(result.correlationId, 'corr-456')
        })
    })

    describe('formatValidationErrors', () => {
        test('should format a single validation error', () => {
            const errors: ValidationErrorItem[] = [{ code: 'MissingField', message: 'name is required' }]

            const result = formatValidationErrors(errors)

            assert.strictEqual(result.success, false)
            assert.strictEqual(result.error.code, 'MissingField')
            assert.strictEqual(result.error.message, 'name is required')
            assert.strictEqual(result.errors, undefined) // No aggregated list for single error
        })

        test('should format multiple validation errors with errors array', () => {
            const errors: ValidationErrorItem[] = [
                { code: 'MissingField', message: 'name is required' },
                { code: 'InvalidFormat', message: 'email must be valid' },
                { code: 'InvalidFormat', message: 'phone must be numeric' }
            ]
            const correlationId = 'validation-test-789'

            const result = formatValidationErrors(errors, correlationId)

            assert.strictEqual(result.success, false)
            // Primary error is the first one
            assert.strictEqual(result.error.code, 'MissingField')
            assert.strictEqual(result.error.message, 'name is required')
            assert.strictEqual(result.correlationId, correlationId)
            // Errors array contains all validation errors
            assert.ok(Array.isArray(result.errors))
            assert.strictEqual(result.errors?.length, 3)
        })

        test('should use default error when empty array provided', () => {
            const result = formatValidationErrors([])

            assert.strictEqual(result.success, false)
            assert.strictEqual(result.error.code, 'ValidationError')
            assert.strictEqual(result.error.message, 'Validation failed')
        })
    })

    describe('errorResponse', () => {
        test('should return HTTP response with correct status and headers', () => {
            const response = errorResponse(404, 'NotFound', 'Resource not found', 'test-corr-id')

            assert.strictEqual(response.status, 404)
            assert.ok(response.headers)
            assert.strictEqual(response.headers['x-correlation-id'], 'test-corr-id')
            assert.strictEqual(response.headers['Content-Type'], 'application/json; charset=utf-8')
            assert.strictEqual(response.headers['Cache-Control'], 'no-store')
        })

        test('should include error envelope in jsonBody', () => {
            const response = errorResponse(400, 'ValidationError', 'Invalid input', 'test-corr-id')

            const body = response.jsonBody as { success: boolean; error: { code: string; message: string }; correlationId: string }
            assert.strictEqual(body.success, false)
            assert.strictEqual(body.error.code, 'ValidationError')
            assert.strictEqual(body.error.message, 'Invalid input')
            assert.strictEqual(body.correlationId, 'test-corr-id')
        })

        test('should handle 500 internal error status', () => {
            const response = errorResponse(500, 'InternalError', 'Something went wrong', 'corr-500')

            assert.strictEqual(response.status, 500)
            const body = response.jsonBody as { error: { code: string } }
            assert.strictEqual(body.error.code, 'InternalError')
        })
    })

    describe('validationErrorResponse', () => {
        test('should return 400 status for validation errors', () => {
            const errors: ValidationErrorItem[] = [{ code: 'MissingField', message: 'name is required' }]

            const response = validationErrorResponse(errors, 'val-corr-id')

            assert.strictEqual(response.status, 400)
            assert.ok(response.headers)
            assert.strictEqual(response.headers['x-correlation-id'], 'val-corr-id')
        })

        test('should include all validation errors in response body', () => {
            const errors: ValidationErrorItem[] = [
                { code: 'MissingField', message: 'email is required' },
                { code: 'MissingField', message: 'password is required' }
            ]

            const response = validationErrorResponse(errors, 'val-corr-id')

            const body = response.jsonBody as { errors?: ValidationErrorItem[] }
            assert.ok(Array.isArray(body.errors))
            assert.strictEqual(body.errors?.length, 2)
        })
    })

    describe('internalErrorResponse', () => {
        test('should handle Error instances', () => {
            const error = new Error('Database connection failed')
            const response = internalErrorResponse(error, 'internal-corr-id')

            assert.strictEqual(response.status, 500)
            const body = response.jsonBody as { error: { code: string; message: string } }
            assert.strictEqual(body.error.code, 'InternalError')
            // In non-production, error message is exposed
            assert.strictEqual(body.error.message, 'Database connection failed')
        })

        test('should handle non-Error values', () => {
            const response = internalErrorResponse('String error', 'internal-corr-id')

            assert.strictEqual(response.status, 500)
            const body = response.jsonBody as { error: { message: string } }
            // Non-Error values are converted to strings
            assert.strictEqual(body.error.message, 'String error')
        })

        test('should handle unknown/undefined errors', () => {
            const response = internalErrorResponse(undefined, 'internal-corr-id')

            assert.strictEqual(response.status, 500)
            const body = response.jsonBody as { error: { message: string } }
            assert.strictEqual(body.error.message, 'Unknown error')
        })

        test('should mask error message in production', () => {
            const originalEnv = process.env.NODE_ENV
            process.env.NODE_ENV = 'production'

            try {
                const error = new Error('Sensitive database error with credentials')
                const response = internalErrorResponse(error, 'prod-corr-id')

                const body = response.jsonBody as { error: { message: string } }
                assert.strictEqual(body.error.message, 'An internal error occurred')
            } finally {
                process.env.NODE_ENV = originalEnv
            }
        })
    })
})
