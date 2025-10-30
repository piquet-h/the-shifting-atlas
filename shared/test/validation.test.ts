import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isValidUuid, validatePlayerId, validateDirection, validateLocationId } from '../src/utils/validation.js'

describe('Validation Utilities', () => {
    describe('isValidUuid', () => {
        it('returns true for valid UUID v4', () => {
            assert.strictEqual(isValidUuid('550e8400-e29b-41d4-a716-446655440000'), true)
            assert.strictEqual(isValidUuid('6ba7b810-9dad-11d1-80b4-00c04fd430c8'), true)
        })

        it('returns false for invalid UUIDs', () => {
            assert.strictEqual(isValidUuid('not-a-uuid'), false)
            assert.strictEqual(isValidUuid('123'), false)
            assert.strictEqual(isValidUuid('550e8400-e29b-41d4-a716'), false)
            assert.strictEqual(isValidUuid(''), false)
        })

        it('returns false for null or undefined', () => {
            assert.strictEqual(isValidUuid(null), false)
            assert.strictEqual(isValidUuid(undefined), false)
        })
    })

    describe('validatePlayerId', () => {
        it('succeeds for valid UUID', () => {
            const result = validatePlayerId('550e8400-e29b-41d4-a716-446655440000')
            assert.strictEqual(result.success, true)
            assert.strictEqual(result.value, '550e8400-e29b-41d4-a716-446655440000')
            assert.strictEqual(result.error, undefined)
        })

        it('fails for invalid UUID format', () => {
            const result = validatePlayerId('not-a-uuid')
            assert.strictEqual(result.success, false)
            assert.strictEqual(result.error?.code, 'INVALID_UUID')
            assert.ok(result.error?.message.includes('valid UUID'))
        })

        it('fails for missing player ID', () => {
            const result1 = validatePlayerId(null)
            assert.strictEqual(result1.success, false)
            assert.strictEqual(result1.error?.code, 'MISSING_PLAYER_ID')

            const result2 = validatePlayerId(undefined)
            assert.strictEqual(result2.success, false)
            assert.strictEqual(result2.error?.code, 'MISSING_PLAYER_ID')

            const result3 = validatePlayerId('')
            assert.strictEqual(result3.success, false)
            assert.strictEqual(result3.error?.code, 'MISSING_PLAYER_ID')
        })
    })

    describe('validateDirection', () => {
        it('succeeds for valid canonical direction', () => {
            const result = validateDirection('north')
            assert.strictEqual(result.success, true)
            assert.strictEqual(result.value, 'north')
        })

        it('succeeds for direction shortcuts', () => {
            const result = validateDirection('n')
            assert.strictEqual(result.success, true)
            assert.strictEqual(result.value, 'north')
        })

        it('fails for invalid direction', () => {
            const result = validateDirection('invalid')
            assert.strictEqual(result.success, false)
            assert.strictEqual(result.error?.code, 'INVALID_DIRECTION')
        })

        it('fails for missing direction', () => {
            const result = validateDirection(null)
            assert.strictEqual(result.success, false)
            assert.strictEqual(result.error?.code, 'INVALID_DIRECTION')
        })

        it('fails with ambiguous code for relative direction without heading', () => {
            const result = validateDirection('left')
            assert.strictEqual(result.success, false)
            assert.strictEqual(result.error?.code, 'AMBIGUOUS_DIRECTION')
            assert.ok(result.error?.clarification)
        })

        it('succeeds for relative direction with heading', () => {
            const result = validateDirection('left', 'north')
            assert.strictEqual(result.success, true)
            assert.strictEqual(result.value, 'west')
        })
    })

    describe('validateLocationId', () => {
        it('succeeds for valid UUID', () => {
            const result = validateLocationId('550e8400-e29b-41d4-a716-446655440000')
            assert.strictEqual(result.success, true)
            assert.strictEqual(result.value, '550e8400-e29b-41d4-a716-446655440000')
        })

        it('fails for invalid UUID', () => {
            const result = validateLocationId('not-a-uuid')
            assert.strictEqual(result.success, false)
            assert.strictEqual(result.error?.code, 'INVALID_UUID')
        })

        it('fails for missing location ID', () => {
            const result = validateLocationId(null)
            assert.strictEqual(result.success, false)
            assert.strictEqual(result.error?.code, 'INVALID_UUID')
        })
    })
})
