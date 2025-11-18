/**
 * Unit tests for edge management pure logic functions
 * Repository implementation tests are in test/integration/edgeManagement.test.ts
 */

import { getOppositeDirection } from '@piquet-h/shared'
import assert from 'node:assert'
import { describe, test } from 'node:test'

describe('getOppositeDirection', () => {
    test('cardinal directions', () => {
        assert.strictEqual(getOppositeDirection('north'), 'south')
        assert.strictEqual(getOppositeDirection('south'), 'north')
        assert.strictEqual(getOppositeDirection('east'), 'west')
        assert.strictEqual(getOppositeDirection('west'), 'east')
    })

    test('diagonal directions', () => {
        assert.strictEqual(getOppositeDirection('northeast'), 'southwest')
        assert.strictEqual(getOppositeDirection('southwest'), 'northeast')
        assert.strictEqual(getOppositeDirection('northwest'), 'southeast')
        assert.strictEqual(getOppositeDirection('southeast'), 'northwest')
    })

    test('vertical and portal directions', () => {
        assert.strictEqual(getOppositeDirection('up'), 'down')
        assert.strictEqual(getOppositeDirection('down'), 'up')
        assert.strictEqual(getOppositeDirection('in'), 'out')
        assert.strictEqual(getOppositeDirection('out'), 'in')
    })
})
