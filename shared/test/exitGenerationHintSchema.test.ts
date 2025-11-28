/**
 * Tests for Exit Generation Hint Schema
 */
import assert from 'node:assert'
import { describe, test } from 'node:test'
import {
    buildExitHintIdempotencyKey,
    isExitHintExpired,
    safeValidateExitGenerationHintPayload,
    validateExitGenerationHintPayload
} from '../src/events/exitGenerationHintSchema'

describe('Exit Generation Hint Schema', () => {
    describe('validateExitGenerationHintPayload', () => {
        test('should validate a correct payload', () => {
            const payload = {
                dir: 'north',
                originLocationId: '00000000-0000-4000-8000-000000000001',
                playerId: '00000000-0000-4000-8000-000000000002',
                timestamp: '2025-01-01T00:00:00.000Z',
                debounced: false
            }

            const result = validateExitGenerationHintPayload(payload)
            assert.strictEqual(result.dir, 'north')
            assert.strictEqual(result.originLocationId, payload.originLocationId)
            assert.strictEqual(result.playerId, payload.playerId)
            assert.strictEqual(result.debounced, false)
        })

        test('should accept all valid directions', () => {
            const validDirections = [
                'north',
                'south',
                'east',
                'west',
                'northeast',
                'northwest',
                'southeast',
                'southwest',
                'up',
                'down',
                'in',
                'out'
            ]

            for (const dir of validDirections) {
                const payload = {
                    dir,
                    originLocationId: '00000000-0000-4000-8000-000000000001',
                    playerId: '00000000-0000-4000-8000-000000000002',
                    timestamp: '2025-01-01T00:00:00.000Z',
                    debounced: false
                }

                const result = validateExitGenerationHintPayload(payload)
                assert.strictEqual(result.dir, dir, `Should accept direction '${dir}'`)
            }
        })

        test('should reject invalid direction', () => {
            const payload = {
                dir: 'invalid-direction',
                originLocationId: '00000000-0000-4000-8000-000000000001',
                playerId: '00000000-0000-4000-8000-000000000002',
                timestamp: '2025-01-01T00:00:00.000Z',
                debounced: false
            }

            assert.throws(() => validateExitGenerationHintPayload(payload), /invalid_value|Invalid/)
        })

        test('should reject missing dir', () => {
            const payload = {
                originLocationId: '00000000-0000-4000-8000-000000000001',
                playerId: '00000000-0000-4000-8000-000000000002',
                timestamp: '2025-01-01T00:00:00.000Z',
                debounced: false
            }

            assert.throws(() => validateExitGenerationHintPayload(payload), /invalid_value|Required/)
        })

        test('should reject invalid UUID in originLocationId', () => {
            const payload = {
                dir: 'north',
                originLocationId: 'not-a-uuid',
                playerId: '00000000-0000-4000-8000-000000000002',
                timestamp: '2025-01-01T00:00:00.000Z',
                debounced: false
            }

            assert.throws(() => validateExitGenerationHintPayload(payload), /Invalid UUID|uuid/)
        })

        test('should reject invalid UUID in playerId', () => {
            const payload = {
                dir: 'north',
                originLocationId: '00000000-0000-4000-8000-000000000001',
                playerId: 'not-a-uuid',
                timestamp: '2025-01-01T00:00:00.000Z',
                debounced: false
            }

            assert.throws(() => validateExitGenerationHintPayload(payload), /Invalid UUID|uuid/)
        })

        test('should reject invalid timestamp format', () => {
            const payload = {
                dir: 'north',
                originLocationId: '00000000-0000-4000-8000-000000000001',
                playerId: '00000000-0000-4000-8000-000000000002',
                timestamp: 'not-a-timestamp',
                debounced: false
            }

            assert.throws(() => validateExitGenerationHintPayload(payload), /Invalid ISO datetime|datetime/)
        })

        test('should reject non-boolean debounced', () => {
            const payload = {
                dir: 'north',
                originLocationId: '00000000-0000-4000-8000-000000000001',
                playerId: '00000000-0000-4000-8000-000000000002',
                timestamp: '2025-01-01T00:00:00.000Z',
                debounced: 'not-a-boolean'
            }

            assert.throws(() => validateExitGenerationHintPayload(payload), /expected boolean|boolean/)
        })
    })

    describe('safeValidateExitGenerationHintPayload', () => {
        test('should return success for valid payload', () => {
            const payload = {
                dir: 'south',
                originLocationId: '00000000-0000-4000-8000-000000000001',
                playerId: '00000000-0000-4000-8000-000000000002',
                timestamp: '2025-01-01T00:00:00.000Z',
                debounced: true
            }

            const result = safeValidateExitGenerationHintPayload(payload)
            assert.strictEqual(result.success, true)
            if (result.success) {
                assert.strictEqual(result.data.dir, 'south')
                assert.strictEqual(result.data.debounced, true)
            }
        })

        test('should return error for invalid payload', () => {
            const payload = {
                dir: 'invalid',
                originLocationId: '00000000-0000-4000-8000-000000000001',
                playerId: '00000000-0000-4000-8000-000000000002',
                timestamp: '2025-01-01T00:00:00.000Z',
                debounced: false
            }

            const result = safeValidateExitGenerationHintPayload(payload)
            assert.strictEqual(result.success, false)
            if (!result.success) {
                assert.ok(result.error.issues.length > 0)
            }
        })
    })

    describe('buildExitHintIdempotencyKey', () => {
        test('should build key from originLocationId and dir', () => {
            const key = buildExitHintIdempotencyKey('location-123', 'north')
            assert.strictEqual(key, 'location-123:north')
        })

        test('should handle UUID format', () => {
            const locationId = '00000000-0000-4000-8000-000000000001'
            const key = buildExitHintIdempotencyKey(locationId, 'south')
            assert.strictEqual(key, `${locationId}:south`)
        })

        test('should produce different keys for different directions', () => {
            const locationId = 'loc-1'
            const keyNorth = buildExitHintIdempotencyKey(locationId, 'north')
            const keySouth = buildExitHintIdempotencyKey(locationId, 'south')
            assert.notStrictEqual(keyNorth, keySouth)
        })

        test('should produce different keys for different locations', () => {
            const key1 = buildExitHintIdempotencyKey('loc-1', 'north')
            const key2 = buildExitHintIdempotencyKey('loc-2', 'north')
            assert.notStrictEqual(key1, key2)
        })
    })

    describe('isExitHintExpired', () => {
        test('should return false for recent timestamp', () => {
            const recentTimestamp = new Date().toISOString()
            assert.strictEqual(isExitHintExpired(recentTimestamp), false)
        })

        test('should return true for old timestamp', () => {
            const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString() // 10 minutes ago
            assert.strictEqual(isExitHintExpired(oldTimestamp), true)
        })

        test('should respect custom maxAgeMs', () => {
            const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString()

            // With default 5 minute window, should not be expired
            assert.strictEqual(isExitHintExpired(oneMinuteAgo, 5 * 60 * 1000), false)

            // With 30 second window, should be expired
            assert.strictEqual(isExitHintExpired(oneMinuteAgo, 30 * 1000), true)
        })

        test('should return false for exact boundary', () => {
            const now = Date.now()
            const exactBoundary = new Date(now - 5 * 60 * 1000 + 100).toISOString() // Just inside 5 minute window
            assert.strictEqual(isExitHintExpired(exactBoundary, 5 * 60 * 1000), false)
        })
    })
})
