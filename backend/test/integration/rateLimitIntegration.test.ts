import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { RateLimiter } from '../../src/middleware/rateLimiter.js'
import { checkRateLimit, extractClientId } from '../../src/middleware/rateLimitMiddleware.js'
import { HttpRequest } from '@azure/functions'

// Mock HttpRequest for testing
function createMockRequest(headers: Record<string, string> = {}): HttpRequest {
    const headerMap = new Map(Object.entries(headers))
    return {
        headers: {
            get: (name: string) => headerMap.get(name.toLowerCase()) || null
        },
        query: new Map()
    } as unknown as HttpRequest
}

describe('Rate Limit Integration', () => {
    let limiter: RateLimiter

    beforeEach(() => {
        limiter = new RateLimiter({
            maxRequests: 3,
            windowMs: 1000,
            identifier: 'test'
        })
    })

    describe('extractClientId', () => {
        it('extracts player GUID as primary identifier', () => {
            const req = createMockRequest({ 'x-player-guid': 'test-player-123' })
            const clientId = extractClientId(req)
            assert.strictEqual(clientId, 'player:test-player-123')
        })

        it('falls back to IP address when no player GUID', () => {
            const req = createMockRequest({ 'x-forwarded-for': '192.168.1.1, 10.0.0.1' })
            const clientId = extractClientId(req)
            assert.strictEqual(clientId, 'ip:192.168.1.1')
        })

        it('returns anonymous when no identifiers available', () => {
            const req = createMockRequest()
            const clientId = extractClientId(req)
            assert.strictEqual(clientId, 'anonymous')
        })
    })

    describe('checkRateLimit', () => {
        it('allows requests under the limit', () => {
            const req = createMockRequest({ 'x-player-guid': 'player1' })

            assert.strictEqual(checkRateLimit(req, limiter, '/api/test'), null)
            assert.strictEqual(checkRateLimit(req, limiter, '/api/test'), null)
            assert.strictEqual(checkRateLimit(req, limiter, '/api/test'), null)
        })

        it('returns 429 when rate limit exceeded', () => {
            const req = createMockRequest({ 'x-player-guid': 'player1' })

            checkRateLimit(req, limiter, '/api/test')
            checkRateLimit(req, limiter, '/api/test')
            checkRateLimit(req, limiter, '/api/test')

            const response = checkRateLimit(req, limiter, '/api/test')
            assert.ok(response, 'Should return rate limit response')
            assert.strictEqual(response?.status, 429)
            assert.ok(response?.headers?.['Retry-After'])
            assert.ok(response?.jsonBody)
        })

        it('includes correlation ID in error response', () => {
            const req = createMockRequest({
                'x-player-guid': 'player1',
                'x-correlation-id': 'test-correlation-123'
            })

            // Exceed limit
            checkRateLimit(req, limiter, '/api/test')
            checkRateLimit(req, limiter, '/api/test')
            checkRateLimit(req, limiter, '/api/test')

            const response = checkRateLimit(req, limiter, '/api/test')
            assert.ok(response?.jsonBody)
            const body = response?.jsonBody as { correlationId?: string }
            assert.strictEqual(body.correlationId, 'test-correlation-123')
        })

        it('tracks different clients separately', () => {
            const req1 = createMockRequest({ 'x-player-guid': 'player1' })
            const req2 = createMockRequest({ 'x-player-guid': 'player2' })

            // Exhaust player1's limit
            checkRateLimit(req1, limiter, '/api/test')
            checkRateLimit(req1, limiter, '/api/test')
            checkRateLimit(req1, limiter, '/api/test')

            // Player1 should be rate limited
            const response1 = checkRateLimit(req1, limiter, '/api/test')
            assert.strictEqual(response1?.status, 429)

            // Player2 should still be allowed
            const response2 = checkRateLimit(req2, limiter, '/api/test')
            assert.strictEqual(response2, null)
        })

        it('includes rate limit headers in 429 response', () => {
            const req = createMockRequest({ 'x-player-guid': 'player1' })

            checkRateLimit(req, limiter, '/api/test')
            checkRateLimit(req, limiter, '/api/test')
            checkRateLimit(req, limiter, '/api/test')

            const response = checkRateLimit(req, limiter, '/api/test')
            assert.ok(response?.headers?.['Retry-After'])
            assert.ok(response?.headers?.['X-RateLimit-Limit'])
            assert.ok(response?.headers?.['X-RateLimit-Reset'])
        })
    })
})
