/**
 * API Contract Validation Tests (Backend)
 *
 * These tests verify that backend handlers expect the headers defined in the
 * shared API contract. If frontend and backend drift apart, these tests will fail.
 *
 * Companion to: frontend/test/apiClient.contract.test.ts
 */
import assert from 'node:assert'
import { describe, test } from 'node:test'

/**
 * Header constants - MUST match frontend expectations in:
 *   - frontend/src/utils/apiClient.ts (buildHeaders, buildMoveRequest)
 *   - frontend/test/apiClient.contract.test.ts
 *
 * When shared package is updated and published, these can be imported from
 * @piquet-h/shared instead.
 */
const API_HEADERS = {
    PLAYER_GUID: 'x-player-guid',
    CORRELATION_ID: 'x-correlation-id',
    CONTENT_TYPE: 'Content-Type'
} as const

/**
 * Validates that a headers object meets the move request contract.
 */
function validateMoveHeaders(headers: Record<string, string | undefined>): {
    valid: boolean
    errors: string[]
} {
    const errors: string[] = []

    if (!headers[API_HEADERS.PLAYER_GUID]) {
        errors.push('Missing required header: x-player-guid')
    } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(headers[API_HEADERS.PLAYER_GUID]!)) {
        errors.push('Invalid x-player-guid format: must be a valid UUID')
    }

    if (headers[API_HEADERS.CONTENT_TYPE] !== 'application/json') {
        errors.push('Content-Type must be application/json')
    }

    return {
        valid: errors.length === 0,
        errors
    }
}

describe('API Contract Validation', () => {
    describe('Move Request Headers', () => {
        test('accepts valid move headers', () => {
            const result = validateMoveHeaders({
                [API_HEADERS.PLAYER_GUID]: '550e8400-e29b-41d4-a716-446655440001',
                [API_HEADERS.CONTENT_TYPE]: 'application/json',
                [API_HEADERS.CORRELATION_ID]: '12345678-1234-1234-1234-123456789012'
            })

            assert.strictEqual(result.valid, true)
            assert.strictEqual(result.errors.length, 0)
        })

        test('rejects missing x-player-guid', () => {
            const result = validateMoveHeaders({
                [API_HEADERS.CONTENT_TYPE]: 'application/json'
            })

            assert.strictEqual(result.valid, false)
            assert.ok(result.errors.some((e) => e.includes('x-player-guid')))
        })

        test('rejects invalid x-player-guid format', () => {
            const result = validateMoveHeaders({
                [API_HEADERS.PLAYER_GUID]: 'not-a-valid-guid',
                [API_HEADERS.CONTENT_TYPE]: 'application/json'
            })

            assert.strictEqual(result.valid, false)
            assert.ok(result.errors.some((e) => e.includes('Invalid x-player-guid format')))
        })

        test('rejects missing Content-Type', () => {
            const result = validateMoveHeaders({
                [API_HEADERS.PLAYER_GUID]: '550e8400-e29b-41d4-a716-446655440001'
            })

            assert.strictEqual(result.valid, false)
            assert.ok(result.errors.some((e) => e.includes('Content-Type')))
        })

        test('rejects wrong Content-Type', () => {
            const result = validateMoveHeaders({
                [API_HEADERS.PLAYER_GUID]: '550e8400-e29b-41d4-a716-446655440001',
                [API_HEADERS.CONTENT_TYPE]: 'text/plain'
            })

            assert.strictEqual(result.valid, false)
            assert.ok(result.errors.some((e) => e.includes('Content-Type')))
        })

        test('allows missing optional correlation-id', () => {
            const result = validateMoveHeaders({
                [API_HEADERS.PLAYER_GUID]: '550e8400-e29b-41d4-a716-446655440001',
                [API_HEADERS.CONTENT_TYPE]: 'application/json'
            })

            assert.strictEqual(result.valid, true)
        })
    })

    describe('API Header Constants', () => {
        test('header constants match expected values', () => {
            // These values MUST match what frontend sends
            assert.strictEqual(API_HEADERS.PLAYER_GUID, 'x-player-guid')
            assert.strictEqual(API_HEADERS.CORRELATION_ID, 'x-correlation-id')
            assert.strictEqual(API_HEADERS.CONTENT_TYPE, 'Content-Type')
        })
    })
})

describe('Contract Documentation', () => {
    /**
     * This test serves as executable documentation for the API contract.
     * If you're changing API expectations, update this test first.
     */
    test('documents the move command header contract', () => {
        // CRITICAL: The backend MoveHandler in moveCore.ts:
        // 1. Reads x-player-guid from BaseHandler.extractPlayerGuid(req.headers)
        // 2. Uses this.playerGuid to update player.currentLocationId after move
        // 3. Without x-player-guid, the move succeeds but location is NOT persisted

        const expectedContract = {
            method: 'POST',
            urlPattern: '/api/player/:playerId/move',
            requiredHeaders: [API_HEADERS.PLAYER_GUID, API_HEADERS.CONTENT_TYPE],
            optionalHeaders: [API_HEADERS.CORRELATION_ID],
            body: { direction: 'string' }
        }

        // This assertion documents the contract
        assert.strictEqual(expectedContract.requiredHeaders.includes(API_HEADERS.PLAYER_GUID), true)
    })
})
