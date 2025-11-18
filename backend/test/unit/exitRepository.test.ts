/**
 * Unit tests for exit repository pure logic functions
 * Repository implementation tests are in test/integration/exitRepository.test.ts
 */

import { Direction } from '@piquet-h/shared'
import assert from 'node:assert'
import { describe, test } from 'node:test'
import { sortExits } from '../../src/repos/exitRepository.js'

describe('sortExits', () => {
    test('compass order (north, south, east, west)', () => {
        const exits = [
            { direction: 'west' as Direction, toLocationId: 'D' },
            { direction: 'north' as Direction, toLocationId: 'A' },
            { direction: 'south' as Direction, toLocationId: 'B' },
            { direction: 'east' as Direction, toLocationId: 'C' }
        ]
        const sorted = sortExits(exits)
        assert.strictEqual(sorted[0].direction, 'north')
        assert.strictEqual(sorted[1].direction, 'south')
        assert.strictEqual(sorted[2].direction, 'east')
        assert.strictEqual(sorted[3].direction, 'west')
    })

    test('diagonal directions after cardinals', () => {
        const exits = [
            { direction: 'southeast' as Direction, toLocationId: 'F' },
            { direction: 'north' as Direction, toLocationId: 'A' },
            { direction: 'northeast' as Direction, toLocationId: 'D' },
            { direction: 'south' as Direction, toLocationId: 'B' }
        ]
        const sorted = sortExits(exits)
        assert.strictEqual(sorted[0].direction, 'north')
        assert.strictEqual(sorted[1].direction, 'south')
        assert.strictEqual(sorted[2].direction, 'northeast')
        assert.strictEqual(sorted[3].direction, 'southeast')
    })

    test('vertical after compass', () => {
        const exits = [
            { direction: 'down' as Direction, toLocationId: 'C' },
            { direction: 'north' as Direction, toLocationId: 'A' },
            { direction: 'up' as Direction, toLocationId: 'B' }
        ]
        const sorted = sortExits(exits)
        assert.strictEqual(sorted[0].direction, 'north')
        assert.strictEqual(sorted[1].direction, 'up')
        assert.strictEqual(sorted[2].direction, 'down')
    })

    test('radial after vertical', () => {
        const exits = [
            { direction: 'out' as Direction, toLocationId: 'D' },
            { direction: 'north' as Direction, toLocationId: 'A' },
            { direction: 'up' as Direction, toLocationId: 'B' },
            { direction: 'in' as Direction, toLocationId: 'C' }
        ]
        const sorted = sortExits(exits)
        assert.strictEqual(sorted[0].direction, 'north')
        assert.strictEqual(sorted[1].direction, 'up')
        assert.strictEqual(sorted[2].direction, 'in')
        assert.strictEqual(sorted[3].direction, 'out')
    })

    test('full ordering (compass → vertical → radial)', () => {
        const exits = [
            { direction: 'in' as Direction, toLocationId: 'J' },
            { direction: 'southwest' as Direction, toLocationId: 'H' },
            { direction: 'down' as Direction, toLocationId: 'I' },
            { direction: 'north' as Direction, toLocationId: 'A' },
            { direction: 'northeast' as Direction, toLocationId: 'E' },
            { direction: 'south' as Direction, toLocationId: 'B' },
            { direction: 'up' as Direction, toLocationId: 'C' },
            { direction: 'out' as Direction, toLocationId: 'K' },
            { direction: 'east' as Direction, toLocationId: 'D' },
            { direction: 'west' as Direction, toLocationId: 'F' },
            { direction: 'northwest' as Direction, toLocationId: 'G' }
        ]
        const sorted = sortExits(exits)
        const expected = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southwest', 'up', 'down', 'in', 'out']
        const actual = sorted.map((e) => e.direction)
        assert.deepStrictEqual(actual, expected)
    })

    test('empty array', () => {
        const sorted = sortExits([])
        assert.strictEqual(sorted.length, 0)
    })

    test('single exit', () => {
        const exits = [{ direction: 'north' as Direction, toLocationId: 'A' }]
        const sorted = sortExits(exits)
        assert.strictEqual(sorted.length, 1)
        assert.strictEqual(sorted[0].direction, 'north')
    })
})
