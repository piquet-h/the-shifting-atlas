import { getOppositeDirection } from '@piquet-h/shared'
import assert from 'node:assert'
import { describe, test } from 'node:test'
import { CosmosLocationRepository } from '../../src/repos/locationRepository.cosmos.js'

describe('Edge Management', () => {
    type VertexMap = Record<string, Record<string, unknown>>
    type ExitArray = Array<Record<string, unknown>>

    class FakeGremlinClient {
        constructor(private data: { locations: VertexMap; exits: Record<string, ExitArray> }) {}
        async submit<T>(query: string, bindings?: Record<string, unknown>): Promise<T[]> {
            if (query.startsWith('g.V') && query.includes('valueMap(true)')) {
                const id = bindings?.locationId || (bindings?.lid as string)
                const r = this.data.locations[id]
                return r ? [r as T] : []
            }
            if (query.includes("outE('exit')")) {
                const fid = bindings?.fid as string
                const dir = bindings?.dir as string
                const tid = bindings?.tid as string

                // If checking for existing edge with where clause
                if (query.includes('where(inV()')) {
                    const exits = this.data.exits[fid] || []
                    const matching = exits.filter((e) => e.direction === dir && e.to === tid)
                    return matching as unknown as T[]
                }

                // If removing edges
                if (query.includes('.drop()')) {
                    const exits = this.data.exits[fid] || []
                    this.data.exits[fid] = exits.filter((e) => e.direction !== dir)
                    return [] as T[]
                }

                // Getting edges for removal check
                const exits = this.data.exits[fid] || []
                return exits.filter((e) => e.direction === dir) as unknown as T[]
            }
            if (query.includes('fold().coalesce(unfold(), addV')) {
                // Vertex upsert - ensure vertex exists
                const id = bindings?.fid || bindings?.tid || bindings?.lid
                if (id && !this.data.locations[id as string]) {
                    this.data.locations[id as string] = { id: id, name: [`Location ${id}`], description: [''] }
                }
                return []
            }
            if (query.includes("addE('exit')")) {
                // Adding new edge
                const fid = bindings?.fid as string
                const tid = bindings?.tid as string
                const dir = bindings?.dir as string
                const desc = bindings?.desc as string

                if (!this.data.exits[fid]) this.data.exits[fid] = []
                this.data.exits[fid].push({ direction: dir, to: tid, description: desc, inV: tid })
                return []
            }
            throw new Error('Unexpected query: ' + query)
        }

        async submitWithMetrics<T>(
            query: string,
            bindings?: Record<string, unknown>
        ): Promise<{ items: T[]; latencyMs: number; requestCharge?: number }> {
            const startTime = Date.now()
            const items = await this.submit<T>(query, bindings)
            return {
                items,
                latencyMs: Date.now() - startTime,
                requestCharge: 5.0 // Mock RU charge
            }
        }

        async close(): Promise<void> {
            // Mock close - no-op
        }
    }

    test('getOppositeDirection - cardinal directions', () => {
        assert.equal(getOppositeDirection('north'), 'south')
        assert.equal(getOppositeDirection('south'), 'north')
        assert.equal(getOppositeDirection('east'), 'west')
        assert.equal(getOppositeDirection('west'), 'east')
    })

    test('getOppositeDirection - diagonal directions', () => {
        assert.equal(getOppositeDirection('northeast'), 'southwest')
        assert.equal(getOppositeDirection('southwest'), 'northeast')
        assert.equal(getOppositeDirection('northwest'), 'southeast')
        assert.equal(getOppositeDirection('southeast'), 'northwest')
    })

    test('getOppositeDirection - vertical and portal directions', () => {
        assert.equal(getOppositeDirection('up'), 'down')
        assert.equal(getOppositeDirection('down'), 'up')
        assert.equal(getOppositeDirection('in'), 'out')
        assert.equal(getOppositeDirection('out'), 'in')
    })

    test('ensureExit - creates new exit and returns created=true', async () => {
        const fake = new FakeGremlinClient({ locations: {}, exits: {} })
        const repo = new CosmosLocationRepository(
            fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> }
        )

        const result = await repo.ensureExit('A', 'north', 'B')
        assert.equal(result.created, true)
    })

    test('ensureExit - idempotent when exit already exists', async () => {
        const fake = new FakeGremlinClient({
            locations: { A: { id: 'A' }, B: { id: 'B' } },
            exits: { A: [{ direction: 'north', to: 'B', description: '' }] }
        })
        const repo = new CosmosLocationRepository(
            fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> }
        )

        const result = await repo.ensureExit('A', 'north', 'B')
        assert.equal(result.created, false)
    })

    test('ensureExitBidirectional - creates forward exit only when reciprocal=false', async () => {
        const fake = new FakeGremlinClient({ locations: {}, exits: {} })
        const repo = new CosmosLocationRepository(
            fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> }
        )

        const result = await repo.ensureExitBidirectional('A', 'north', 'B', { reciprocal: false })
        assert.equal(result.created, true)
        assert.equal(result.reciprocalCreated, undefined)
    })

    test('ensureExitBidirectional - creates both exits when reciprocal=true', async () => {
        const fake = new FakeGremlinClient({ locations: {}, exits: {} })
        const repo = new CosmosLocationRepository(
            fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> }
        )

        const result = await repo.ensureExitBidirectional('A', 'north', 'B', { reciprocal: true })
        assert.equal(result.created, true)
        assert.equal(result.reciprocalCreated, true)
    })

    test('ensureExitBidirectional - idempotent when both exits exist', async () => {
        const fake = new FakeGremlinClient({
            locations: { A: { id: 'A' }, B: { id: 'B' } },
            exits: {
                A: [{ direction: 'north', to: 'B', description: '' }],
                B: [{ direction: 'south', to: 'A', description: '' }]
            }
        })
        const repo = new CosmosLocationRepository(
            fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> }
        )

        const result = await repo.ensureExitBidirectional('A', 'north', 'B', { reciprocal: true })
        assert.equal(result.created, false)
        assert.equal(result.reciprocalCreated, false)
    })

    test('ensureExitBidirectional - creates only missing reciprocal when forward exists', async () => {
        const fake = new FakeGremlinClient({
            locations: { A: { id: 'A' }, B: { id: 'B' } },
            exits: { A: [{ direction: 'north', to: 'B', description: '' }] }
        })
        const repo = new CosmosLocationRepository(
            fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> }
        )

        const result = await repo.ensureExitBidirectional('A', 'north', 'B', { reciprocal: true })
        assert.equal(result.created, false)
        assert.equal(result.reciprocalCreated, true)
    })

    test('removeExit - removes existing exit and returns removed=true', async () => {
        const fake = new FakeGremlinClient({
            locations: { A: { id: 'A' }, B: { id: 'B' } },
            exits: { A: [{ direction: 'north', to: 'B', description: '', inV: 'B' }] }
        })
        const repo = new CosmosLocationRepository(
            fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> }
        )

        const result = await repo.removeExit('A', 'north')
        assert.equal(result.removed, true)
    })

    test('removeExit - returns removed=false when exit does not exist', async () => {
        const fake = new FakeGremlinClient({ locations: { A: { id: 'A' } }, exits: {} })
        const repo = new CosmosLocationRepository(
            fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> }
        )

        const result = await repo.removeExit('A', 'north')
        assert.equal(result.removed, false)
    })

    test('removeExit - returns removed=false for invalid direction', async () => {
        const fake = new FakeGremlinClient({ locations: {}, exits: {} })
        const repo = new CosmosLocationRepository(
            fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> }
        )

        const result = await repo.removeExit('A', 'invalid-direction')
        assert.equal(result.removed, false)
    })

    test('applyExits - batch creates multiple exits with metrics', async () => {
        const fake = new FakeGremlinClient({ locations: {}, exits: {} })
        const repo = new CosmosLocationRepository(
            fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> }
        )

        const result = await repo.applyExits([
            { fromId: 'A', direction: 'north', toId: 'B', reciprocal: false },
            { fromId: 'B', direction: 'east', toId: 'C', reciprocal: false },
            { fromId: 'C', direction: 'south', toId: 'A', reciprocal: false }
        ])

        assert.equal(result.exitsCreated, 3)
        assert.equal(result.exitsSkipped, 0)
        assert.equal(result.reciprocalApplied, 0)
    })

    test('applyExits - batch with reciprocal exits', async () => {
        const fake = new FakeGremlinClient({ locations: {}, exits: {} })
        const repo = new CosmosLocationRepository(
            fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> }
        )

        const result = await repo.applyExits([
            { fromId: 'A', direction: 'north', toId: 'B', reciprocal: true },
            { fromId: 'C', direction: 'west', toId: 'A', reciprocal: true }
        ])

        assert.equal(result.exitsCreated, 2)
        assert.equal(result.exitsSkipped, 0)
        assert.equal(result.reciprocalApplied, 2)
    })

    test('applyExits - batch with mix of new and existing exits', async () => {
        const fake = new FakeGremlinClient({
            locations: { A: { id: 'A' }, B: { id: 'B' } },
            exits: { A: [{ direction: 'north', to: 'B', description: '' }] }
        })
        const repo = new CosmosLocationRepository(
            fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> }
        )

        const result = await repo.applyExits([
            { fromId: 'A', direction: 'north', toId: 'B', reciprocal: false }, // Exists
            { fromId: 'B', direction: 'east', toId: 'C', reciprocal: false } // New
        ])

        assert.equal(result.exitsCreated, 1)
        assert.equal(result.exitsSkipped, 1)
        assert.equal(result.reciprocalApplied, 0)
    })

    test('applyExits - empty array returns zero metrics', async () => {
        const fake = new FakeGremlinClient({ locations: {}, exits: {} })
        const repo = new CosmosLocationRepository(
            fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> }
        )

        const result = await repo.applyExits([])

        assert.equal(result.exitsCreated, 0)
        assert.equal(result.exitsSkipped, 0)
        assert.equal(result.reciprocalApplied, 0)
    })

    test('location version policy - version unchanged when only exits added', async () => {
        const existingLocation = { id: 'A', name: ['Alpha'], description: ['First location'], version: 1 }
        const fake = new FakeGremlinClient({ locations: { A: existingLocation }, exits: {} })
        const repo = new CosmosLocationRepository(
            fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> }
        )

        // Add exit (structural change only)
        await repo.ensureExit('A', 'north', 'B')

        // Fetch location and verify version unchanged
        const location = await repo.get('A')
        assert.ok(location)
        assert.equal(location.version, 1)
    })

    test('location version policy - version unchanged when exit removed', async () => {
        const existingLocation = { id: 'A', name: ['Alpha'], description: ['First location'], version: 2 }
        const fake = new FakeGremlinClient({
            locations: { A: existingLocation },
            exits: { A: [{ direction: 'north', to: 'B', description: '', inV: 'B' }] }
        })
        const repo = new CosmosLocationRepository(
            fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> }
        )

        // Remove exit (structural change only)
        await repo.removeExit('A', 'north')

        // Fetch location and verify version unchanged
        const location = await repo.get('A')
        assert.ok(location)
        assert.equal(location.version, 2)
    })
})
