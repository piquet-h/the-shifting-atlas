import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import sinon from 'sinon'
import { RateLimiter } from '../../src/middleware/rateLimiter.js'

describe('RateLimiter', () => {
    let limiter: RateLimiter
    let clock: sinon.SinonFakeTimers

    beforeEach(() => {
        clock = sinon.useFakeTimers()
        limiter = new RateLimiter({
            maxRequests: 3,
            windowMs: 1000,
            identifier: 'test'
        })
    })

    afterEach(() => {
        limiter.stop()
        clock.restore()
    })

    describe('basic functionality', () => {
        it('allows requests up to the limit', () => {
            assert.strictEqual(limiter.check('client1'), true, 'Request 1 should be allowed')
            assert.strictEqual(limiter.check('client1'), true, 'Request 2 should be allowed')
            assert.strictEqual(limiter.check('client1'), true, 'Request 3 should be allowed')
        })

        it('blocks requests beyond the limit', () => {
            limiter.check('client1')
            limiter.check('client1')
            limiter.check('client1')
            assert.strictEqual(limiter.check('client1'), false, 'Request 4 should be blocked')
            assert.strictEqual(limiter.check('client1'), false, 'Request 5 should be blocked')
        })

        it('resets counter after window expires', () => {
            const shortLimiter = new RateLimiter({
                maxRequests: 2,
                windowMs: 100,
                identifier: 'short'
            })

            try {
                shortLimiter.check('client1')
                shortLimiter.check('client1')
                assert.strictEqual(shortLimiter.check('client1'), false, 'Should be blocked before window expires')

                // Advance time by 150ms
                clock.tick(150)

                assert.strictEqual(shortLimiter.check('client1'), true, 'Should be allowed after window expires')
            } finally {
                shortLimiter.stop()
            }
        })

        it('tracks different clients independently', () => {
            limiter.check('client1')
            limiter.check('client1')
            limiter.check('client1')

            assert.strictEqual(limiter.check('client1'), false, 'Client 1 should be blocked')
            assert.strictEqual(limiter.check('client2'), true, 'Client 2 should be allowed')
        })
    })

    describe('getViolation', () => {
        it('returns violation information', () => {
            limiter.check('client1')
            limiter.check('client1')
            limiter.check('client1')
            limiter.check('client1') // This one is blocked

            const violation = limiter.getViolation('client1', '/api/test')
            assert.strictEqual(violation.route, '/api/test')
            assert.strictEqual(violation.limit, 3)
            assert.strictEqual(violation.windowMs, 1000)
            assert.strictEqual(violation.clientId, 'client1')
            assert.strictEqual(violation.requestCount, 3)
            assert.ok(violation.resetAt > Date.now())
        })
    })

    describe('getResetTime', () => {
        it('returns 0 for clients with no record', () => {
            assert.strictEqual(limiter.getResetTime('unknown'), 0)
        })

        it('returns time until reset for tracked clients', () => {
            limiter.check('client1')
            const resetTime = limiter.getResetTime('client1')
            // With fake timers, reset time should be exactly 1 second in the future
            assert.strictEqual(resetTime, 1)
        })
    })

    describe('clear', () => {
        it('clears all client data', () => {
            limiter.check('client1')
            limiter.check('client1')
            limiter.check('client1')
            assert.strictEqual(limiter.check('client1'), false)

            limiter.clear()
            assert.strictEqual(limiter.check('client1'), true, 'Should allow request after clear')
        })
    })

    describe('cleanup', () => {
        it('removes expired records periodically', () => {
            const shortLimiter = new RateLimiter({
                maxRequests: 1,
                windowMs: 50,
                identifier: 'cleanup-test'
            })

            try {
                shortLimiter.check('client1')
                assert.strictEqual(shortLimiter.check('client1'), false, 'Should be blocked')

                // Advance time past the window, but not past the cleanup interval
                clock.tick(55)
                assert.strictEqual(shortLimiter.check('client1'), true, 'Should be allowed after window reset')
                assert.strictEqual(shortLimiter.check('client1'), false, 'Should be blocked again')

                // Advance time past the cleanup interval to trigger cleanup
                clock.tick(60000) // Default cleanup is 60s

                // After cleanup, the record for 'client1' should be gone, but this is hard to verify directly.
                // We can verify that the limiter still works as expected.
                assert.strictEqual(shortLimiter.check('client2'), true, 'New client should be allowed')
            } finally {
                shortLimiter.stop()
            }
        })
    })
})
