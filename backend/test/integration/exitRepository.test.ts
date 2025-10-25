import { Direction } from '@piquet-h/shared'
import assert from 'node:assert'
import { test } from 'node:test'
import { ExitRepository, sortExits } from '../../src/repos/exitRepository.js'

type ExitData = { direction: string; toLocationId: string; description?: string; kind?: string; state?: string }

class FakeGremlinClient {
    constructor(private exits: Record<string, ExitData[]>) {}
    async submit<T>(query: string, bindings?: Record<string, unknown>): Promise<T[]> {
        const locationId = bindings?.locationId as string
        if (query.includes("outE('exit')")) {
            const exits = this.exits[locationId] || []
            return exits.map((e) => ({
                direction: e.direction,
                toLocationId: e.toLocationId,
                description: e.description,
                kind: e.kind,
                state: e.state
            })) as unknown as T[]
        }
        return []
    }
}

test('sortExits - compass order (north, south, east, west)', () => {
    const exits = [
        { direction: 'west' as Direction, toLocationId: 'D' },
        { direction: 'north' as Direction, toLocationId: 'A' },
        { direction: 'south' as Direction, toLocationId: 'B' },
        { direction: 'east' as Direction, toLocationId: 'C' }
    ]
    const sorted = sortExits(exits)
    assert.equal(sorted[0].direction, 'north')
    assert.equal(sorted[1].direction, 'south')
    assert.equal(sorted[2].direction, 'east')
    assert.equal(sorted[3].direction, 'west')
})

test('sortExits - diagonal directions after cardinals', () => {
    const exits = [
        { direction: 'southeast' as Direction, toLocationId: 'F' },
        { direction: 'north' as Direction, toLocationId: 'A' },
        { direction: 'northeast' as Direction, toLocationId: 'D' },
        { direction: 'south' as Direction, toLocationId: 'B' }
    ]
    const sorted = sortExits(exits)
    assert.equal(sorted[0].direction, 'north')
    assert.equal(sorted[1].direction, 'south')
    assert.equal(sorted[2].direction, 'northeast')
    assert.equal(sorted[3].direction, 'southeast')
})

test('sortExits - vertical after compass', () => {
    const exits = [
        { direction: 'down' as Direction, toLocationId: 'C' },
        { direction: 'north' as Direction, toLocationId: 'A' },
        { direction: 'up' as Direction, toLocationId: 'B' }
    ]
    const sorted = sortExits(exits)
    assert.equal(sorted[0].direction, 'north')
    assert.equal(sorted[1].direction, 'up')
    assert.equal(sorted[2].direction, 'down')
})

test('sortExits - radial after vertical', () => {
    const exits = [
        { direction: 'out' as Direction, toLocationId: 'D' },
        { direction: 'north' as Direction, toLocationId: 'A' },
        { direction: 'up' as Direction, toLocationId: 'B' },
        { direction: 'in' as Direction, toLocationId: 'C' }
    ]
    const sorted = sortExits(exits)
    assert.equal(sorted[0].direction, 'north')
    assert.equal(sorted[1].direction, 'up')
    assert.equal(sorted[2].direction, 'in')
    assert.equal(sorted[3].direction, 'out')
})

test('sortExits - full ordering (compass → vertical → radial)', () => {
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
    assert.deepEqual(actual, expected)
})

test('sortExits - empty array', () => {
    const sorted = sortExits([])
    assert.equal(sorted.length, 0)
})

test('sortExits - single exit', () => {
    const exits = [{ direction: 'north' as Direction, toLocationId: 'A' }]
    const sorted = sortExits(exits)
    assert.equal(sorted.length, 1)
    assert.equal(sorted[0].direction, 'north')
})

test('ExitRepository.getExits - returns ordered exits', async () => {
    const fake = new FakeGremlinClient({
        loc1: [
            { direction: 'south', toLocationId: 'B' },
            { direction: 'north', toLocationId: 'A' },
            { direction: 'east', toLocationId: 'C' }
        ]
    })
    const repo = new ExitRepository(fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> })

    const exits = await repo.getExits('loc1')
    assert.equal(exits.length, 3)
    assert.equal(exits[0].direction, 'north')
    assert.equal(exits[1].direction, 'south')
    assert.equal(exits[2].direction, 'east')
})

test('ExitRepository.getExits - returns empty array for location with no exits', async () => {
    const fake = new FakeGremlinClient({ loc1: [] })
    const repo = new ExitRepository(fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> })

    const exits = await repo.getExits('loc1')
    assert.equal(exits.length, 0)
})

test('ExitRepository.getExits - includes optional properties', async () => {
    const fake = new FakeGremlinClient({
        loc1: [
            {
                direction: 'north',
                toLocationId: 'A',
                description: 'A wooden door',
                kind: 'cardinal',
                state: 'open'
            }
        ]
    })
    const repo = new ExitRepository(fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> })

    const exits = await repo.getExits('loc1')
    assert.equal(exits.length, 1)
    assert.equal(exits[0].direction, 'north')
    assert.equal(exits[0].toLocationId, 'A')
    assert.equal(exits[0].description, 'A wooden door')
    assert.equal(exits[0].kind, 'cardinal')
    assert.equal(exits[0].state, 'open')
})
