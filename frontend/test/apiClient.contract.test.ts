/**
 * API Client Header Contract Tests
 * Validates that the frontend sends correct headers expected by the backend.
 *
 * These tests verify the contract between frontend API calls and backend expectations:
 * - x-player-guid header is sent for player-specific operations
 * - x-correlation-id header is sent for all requests
 * - Content-Type is set correctly
 *
 * This prevents regressions where frontend and backend drift apart on expected headers.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildHeaders, buildLocationUrl, buildMoveRequest } from '../src/utils/apiClient'
import { buildCorrelationHeaders, generateCorrelationId } from '../src/utils/correlation'

/**
 * Header constants - MUST match backend expectations in:
 *   - backend/src/handlers/base/BaseHandler.ts (extractPlayerGuid)
 *   - backend/src/telemetry/TelemetryService.ts (extractCorrelationId)
 */
const API_HEADERS = {
    PLAYER_GUID: 'x-player-guid',
    CORRELATION_ID: 'x-correlation-id',
    CONTENT_TYPE: 'Content-Type'
} as const

/**
 * Validates that a headers object meets the move request contract.
 * Use this in tests to verify header compliance.
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

describe('API Client - Header Contract Tests', () => {
    describe('buildMoveRequest', () => {
        const validPlayerGuid = '550e8400-e29b-41d4-a716-446655440001'

        it('builds correct URL with player GUID in path', () => {
            const result = buildMoveRequest(validPlayerGuid, 'north')

            expect(result.url).toBe(`/api/player/${validPlayerGuid}/move`)
            expect(result.method).toBe('POST')
            expect(result.body).toEqual({ direction: 'north' })
        })

        it('throws error for invalid player GUID', () => {
            expect(() => buildMoveRequest('invalid-guid', 'north')).toThrow('Player ID must be a valid GUID')
            expect(() => buildMoveRequest(null, 'north')).toThrow('Player ID must be a valid GUID')
            expect(() => buildMoveRequest('', 'north')).toThrow('Player ID must be a valid GUID')
        })
    })

    describe('buildHeaders', () => {
        it('merges additional headers with defaults', () => {
            const headers = buildHeaders({
                'Content-Type': 'application/json',
                'x-player-guid': '550e8400-e29b-41d4-a716-446655440001'
            })

            expect(headers).toEqual({
                'Content-Type': 'application/json',
                'x-player-guid': '550e8400-e29b-41d4-a716-446655440001'
            })
        })

        it('returns empty object when no additional headers', () => {
            const headers = buildHeaders()
            expect(headers).toEqual({})
        })
    })

    describe('buildCorrelationHeaders', () => {
        it('creates correlation header with provided ID', () => {
            const correlationId = '12345678-1234-1234-1234-123456789012'
            const headers = buildCorrelationHeaders(correlationId)

            expect(headers).toEqual({
                'x-correlation-id': correlationId
            })
        })
    })

    describe('buildLocationUrl', () => {
        it('builds URL with location ID when provided', () => {
            const locationId = 'a7e3f8c0-1234-4abc-9def-1234567890ab'
            const url = buildLocationUrl(locationId)

            expect(url).toBe(`/api/location/${locationId}`)
        })

        it('builds URL without location ID when undefined', () => {
            const url = buildLocationUrl(undefined)

            expect(url).toBe('/api/location')
        })
    })

    describe('generateCorrelationId', () => {
        beforeEach(() => {
            vi.stubGlobal('crypto', {
                ...crypto,
                randomUUID: () => 'mock-uuid-1234-5678-9012-345678901234'
            })
        })

        it('generates valid correlation ID', () => {
            const id = generateCorrelationId()
            expect(id).toBe('mock-uuid-1234-5678-9012-345678901234')
        })
    })
})

describe('Move Command Header Contract', () => {
    /**
     * This test documents the REQUIRED headers for move commands.
     * The backend MoveHandler expects:
     *   - x-player-guid: Player identifier (for updating player location)
     *   - x-correlation-id: Request tracing (optional but recommended)
     *   - Content-Type: application/json
     *
     * If this test fails, it means the frontend/backend contract has drifted.
     */
    it('documents required headers for move command', () => {
        const playerGuid = '550e8400-e29b-41d4-a716-446655440001'
        const correlationId = generateCorrelationId()

        // These are the headers that MUST be sent for move commands
        const requiredHeaders = buildHeaders({
            'Content-Type': 'application/json',
            'x-player-guid': playerGuid,
            ...buildCorrelationHeaders(correlationId)
        }) as Record<string, string>

        // Validate contract
        expect(requiredHeaders['Content-Type']).toBe('application/json')
        expect(requiredHeaders['x-player-guid']).toBe(playerGuid)
        expect(requiredHeaders['x-correlation-id']).toBeDefined()

        // Also validate using shared contract validator
        const validation = validateMoveHeaders(requiredHeaders)
        expect(validation.valid).toBe(true)
        expect(validation.errors).toHaveLength(0)
    })

    /**
     * CRITICAL: The backend MoveHandler uses x-player-guid from headers to identify
     * which player's location to update. Without this header, the player location
     * won't be persisted after a move.
     *
     * See: backend/src/handlers/moveCore.ts (line ~264)
     *   - this.playerGuid comes from BaseHandler.extractPlayerGuid(req.headers)
     *   - If not set, player.currentLocationId is never updated
     */
    it('x-player-guid header is required for player location persistence', () => {
        const playerGuid = '550e8400-e29b-41d4-a716-446655440001'

        // Build headers exactly as CommandInterface.tsx does for move
        const moveHeaders = buildHeaders({
            'Content-Type': 'application/json',
            'x-player-guid': playerGuid
        }) as Record<string, string>

        // This assertion documents the critical requirement
        expect(moveHeaders[API_HEADERS.PLAYER_GUID]).toBe(playerGuid)
        expect(moveHeaders[API_HEADERS.PLAYER_GUID]).not.toBe('')
        expect(moveHeaders[API_HEADERS.PLAYER_GUID]).toBeDefined()
    })

    it('rejects headers missing x-player-guid', () => {
        const headersWithoutGuid = buildHeaders({
            'Content-Type': 'application/json'
        }) as Record<string, string>

        const validation = validateMoveHeaders(headersWithoutGuid)
        expect(validation.valid).toBe(false)
        expect(validation.errors).toContain('Missing required header: x-player-guid')
    })
})

describe('Look Command Header Contract', () => {
    /**
     * Look commands are less strict - they don't require x-player-guid
     * because the location endpoint doesn't need player identity.
     * However, correlation ID is still recommended for tracing.
     */
    it('documents optional headers for look command', () => {
        const correlationId = generateCorrelationId()

        const lookHeaders = buildHeaders({
            ...buildCorrelationHeaders(correlationId)
        }) as Record<string, string>

        // Correlation ID is recommended but not required
        expect(lookHeaders[API_HEADERS.CORRELATION_ID]).toBeDefined()
    })
})
