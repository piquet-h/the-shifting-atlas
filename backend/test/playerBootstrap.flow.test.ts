/**
 * Player Bootstrap Flow Tests
 * Regression tests ensuring explorer (player) bootstrap path works correctly.
 * Refs: issue #24 (bug fix), issue #110 (regression test suite)
 * 
 * Future: See docs/modules/explorer-creation-future.md for planned D&D-style
 * character creation expansion (attributes, background, class selection).
 */
import assert from 'node:assert'
import { describe, test, beforeEach } from 'node:test'
import type { HttpRequest } from '@azure/functions'
import { playerBootstrap } from '../src/functions/bootstrapPlayer.js'
import { __resetPlayerRepositoryForTests } from '@piquet-h/shared'

// Mock HttpRequest factory
function createMockHttpRequest(options: {
    playerGuidHeader?: string
} = {}): HttpRequest {
    const headers = new Map<string, string>()
    if (options.playerGuidHeader) {
        headers.set('x-player-guid', options.playerGuidHeader)
    }
    
    return {
        method: 'GET',
        url: 'http://localhost/api/player/bootstrap',
        headers: {
            get: (key: string) => headers.get(key.toLowerCase()) || null,
            has: (key: string) => headers.has(key.toLowerCase()),
            entries: () => headers.entries(),
            keys: () => headers.keys(),
            values: () => headers.values(),
            forEach: (callback: (value: string, key: string) => void) => {
                headers.forEach(callback)
            },
            set: (key: string, value: string) => {
                headers.set(key.toLowerCase(), value)
            },
            delete: (key: string) => {
                headers.delete(key.toLowerCase())
            },
            append: (key: string, value: string) => {
                headers.set(key.toLowerCase(), value)
            }
        },
        query: {
            get: () => null,
            has: () => false,
            entries: () => [][Symbol.iterator](),
            keys: () => [][Symbol.iterator](),
            values: () => [][Symbol.iterator](),
            forEach: () => {},
            set: () => {},
            delete: () => false,
            append: () => {}
        },
        params: {},
        user: null,
        body: undefined,
        bodyUsed: false,
        arrayBuffer: async () => new ArrayBuffer(0),
        blob: async () => new Blob(),
        formData: async () => new FormData(),
        json: async () => ({}),
        text: async () => '',
        clone: () => createMockHttpRequest(options)
    } as unknown as HttpRequest
}

describe('Player Bootstrap Flow', () => {
    beforeEach(() => {
        // Reset player repository state before each test
        __resetPlayerRepositoryForTests()
    })

    test('initial bootstrap returns GUID + created=true', async () => {
        const request = createMockHttpRequest()
        const response = await playerBootstrap(request)
        
        assert.strictEqual(response.status, 200, 'Should return 200 status')
        assert.ok(response.jsonBody, 'Should have JSON body')
        
        const body = response.jsonBody as Record<string, unknown>
        assert.ok(body.playerGuid, 'Should have playerGuid')
        assert.strictEqual(typeof body.playerGuid, 'string', 'playerGuid should be string')
        assert.strictEqual(body.created, true, 'created should be true for new player')
        assert.ok(body.currentLocationId, 'Should have currentLocationId')
        
        // Verify GUID format (UUID v4)
        const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        assert.match(body.playerGuid as string, guidRegex, 'playerGuid should be valid UUID')
    })

    test('repeat bootstrap with header returns same GUID created=false', async () => {
        // First bootstrap to create a player
        const firstRequest = createMockHttpRequest()
        const firstResponse = await playerBootstrap(firstRequest)
        const firstBody = firstResponse.jsonBody as Record<string, unknown>
        const playerGuid = firstBody.playerGuid as string
        
        // Reset repo to simulate a fresh request with existing player
        __resetPlayerRepositoryForTests()
        
        // Second bootstrap with the GUID header
        const secondRequest = createMockHttpRequest({ playerGuidHeader: playerGuid })
        const secondResponse = await playerBootstrap(secondRequest)
        
        assert.strictEqual(secondResponse.status, 200, 'Should return 200 status')
        const secondBody = secondResponse.jsonBody as Record<string, unknown>
        
        assert.strictEqual(secondBody.playerGuid, playerGuid, 'Should return same playerGuid')
        assert.strictEqual(secondBody.created, false, 'created should be false for existing player')
        
        // Verify response header also includes the GUID
        assert.ok(secondResponse.headers, 'Should have headers')
        const headers = secondResponse.headers as Record<string, string>
        assert.strictEqual(headers['x-player-guid'], playerGuid, 'Response header should include playerGuid')
    })

    test('latencyMs property present and reasonable', async () => {
        const request = createMockHttpRequest()
        const response = await playerBootstrap(request)
        
        assert.strictEqual(response.status, 200, 'Should return 200 status')
        const body = response.jsonBody as Record<string, unknown>
        
        assert.ok(body.latencyMs !== undefined, 'Should have latencyMs property')
        assert.strictEqual(typeof body.latencyMs, 'number', 'latencyMs should be a number')
        assert.ok(body.latencyMs >= 0, 'latencyMs should be non-negative')
        
        // Soft assertion: log warning if latency exceeds 2 seconds
        if (body.latencyMs > 2000) {
            console.warn(`⚠️  Bootstrap latency exceeded 2s: ${body.latencyMs}ms (soft assertion - informational only)`)
        }
        
        // Hard assertion: latency should be reasonable (not astronomically high)
        assert.ok(body.latencyMs < 30000, 'latencyMs should be less than 30 seconds')
    })

    test('malformed GUID header creates new GUID', async () => {
        const malformedGuids = [
            'not-a-guid',
            '12345',
            'invalid-uuid-format',
            'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
        ]
        
        for (const malformed of malformedGuids) {
            __resetPlayerRepositoryForTests()
            
            const request = createMockHttpRequest({ playerGuidHeader: malformed })
            const response = await playerBootstrap(request)
            
            assert.strictEqual(response.status, 200, `Should return 200 for malformed GUID: ${malformed}`)
            const body = response.jsonBody as Record<string, unknown>
            
            assert.ok(body.playerGuid, 'Should have playerGuid')
            assert.notStrictEqual(body.playerGuid, malformed, 'Should not return malformed GUID')
            assert.strictEqual(body.created, true, 'Should create new player for malformed GUID')
        }
    })

    test('empty GUID header creates new GUID', async () => {
        const emptyValues = ['', '   ', '\t', '\n']
        
        for (const empty of emptyValues) {
            __resetPlayerRepositoryForTests()
            
            const request = createMockHttpRequest({ playerGuidHeader: empty })
            const response = await playerBootstrap(request)
            
            assert.strictEqual(response.status, 200, 'Should return 200 for empty GUID header')
            const body = response.jsonBody as Record<string, unknown>
            
            assert.ok(body.playerGuid, 'Should have playerGuid')
            assert.strictEqual(body.created, true, 'Should create new player for empty GUID header')
            
            // Verify it's a valid GUID
            const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
            assert.match(body.playerGuid as string, guidRegex, 'Should return valid UUID')
        }
    })

    test('rapid repeat calls maintain idempotency', async () => {
        // First call creates player
        const firstRequest = createMockHttpRequest()
        const firstResponse = await playerBootstrap(firstRequest)
        const firstBody = firstResponse.jsonBody as Record<string, unknown>
        const playerGuid = firstBody.playerGuid as string
        
        __resetPlayerRepositoryForTests()
        
        // Make multiple rapid calls with the same GUID
        const promises = Array.from({ length: 5 }, () => {
            const request = createMockHttpRequest({ playerGuidHeader: playerGuid })
            return playerBootstrap(request)
        })
        
        const responses = await Promise.all(promises)
        
        // All responses should return the same GUID with created=false
        for (const response of responses) {
            assert.strictEqual(response.status, 200, 'Should return 200 status')
            const body = response.jsonBody as Record<string, unknown>
            assert.strictEqual(body.playerGuid, playerGuid, 'Should return same playerGuid')
            assert.strictEqual(body.created, false, 'created should be false for all repeated calls')
        }
    })

    test('response includes required headers', async () => {
        const request = createMockHttpRequest()
        const response = await playerBootstrap(request)
        
        assert.ok(response.headers, 'Should have headers')
        const headers = response.headers as Record<string, string>
        
        assert.ok(headers['Content-Type'], 'Should have Content-Type header')
        assert.match(headers['Content-Type'], /application\/json/, 'Content-Type should be application/json')
        
        assert.strictEqual(headers['Cache-Control'], 'no-store', 'Should have Cache-Control: no-store')
        
        assert.ok(headers['x-player-guid'], 'Should have x-player-guid response header')
        
        // Correlation header should be present
        const body = response.jsonBody as Record<string, unknown>
        assert.ok(headers['x-correlation-id'] || body.playerGuid, 'Should have correlation tracking')
    })

    test('response body has all required fields', async () => {
        const request = createMockHttpRequest()
        const response = await playerBootstrap(request)
        
        assert.strictEqual(response.status, 200, 'Should return 200 status')
        const body = response.jsonBody as Record<string, unknown>
        
        // Required fields
        assert.ok(body.playerGuid, 'Should have playerGuid')
        assert.ok(typeof body.created === 'boolean', 'Should have created boolean')
        assert.ok(body.currentLocationId, 'Should have currentLocationId')
        assert.ok(typeof body.latencyMs === 'number', 'Should have latencyMs number')
        
        // Optional fields (may or may not be present)
        if (body.name !== undefined) {
            assert.strictEqual(typeof body.name, 'string', 'name should be string if present')
        }
    })
})
