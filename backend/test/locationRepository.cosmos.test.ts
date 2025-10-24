import assert from 'node:assert'
import { test } from 'node:test'
import { CosmosLocationRepository } from '../src/repos/locationRepository.cosmos.js'

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
        if (query.includes('.drop()')) {
            const fromId = bindings?.fid as string
            const dir = bindings?.dir as string
            if (this.data.exits[fromId]) {
                this.data.exits[fromId] = this.data.exits[fromId].filter((e) => e.direction !== dir)
            }
            return []
        }
        if (query.includes("has('direction'") && query.includes('.where(inV()')) {
            const fromId = bindings?.fid as string
            const dir = bindings?.dir as string
            const exits = this.data.exits[fromId] || []
            return exits.filter((e) => e.direction === dir) as unknown as T[]
        }
        if (query.includes("has('direction'")) {
            const fromId = bindings?.fid as string
            const dir = bindings?.dir as string
            const exits = this.data.exits[fromId] || []
            return exits.filter((e) => e.direction === dir) as unknown as T[]
        }
        if (query.includes("outE('exit')")) {
            const id = bindings?.locationId as string
            return (this.data.exits[id] || []) as unknown as T[]
        }
        if (query.includes('fold().coalesce(unfold(), addV')) {
            const id = bindings?.lid as string
            const name = bindings?.name as string
            const desc = bindings?.desc as string
            const ver = bindings?.ver as number
            
            const tags: string[] = []
            if (bindings) {
                for (let i = 0; ; i++) {
                    const tagKey = `tag${i}`
                    if (tagKey in bindings) {
                        tags.push(bindings[tagKey] as string)
                    } else {
                        break
                    }
                }
            }

            this.data.locations[id] = {
                id: id,
                name: [name],
                description: [desc],
                version: ver,
                ...(tags.length > 0 ? { tags: tags } : {})
            }
            return []
        }
        if (query.includes("property('exitsSummaryCache'")) {
            const id = bindings?.locationId as string
            const cache = bindings?.cache as string
            if (this.data.locations[id]) {
                this.data.locations[id].exitsSummaryCache = [cache]
            }
            return []
        }
        if (query.includes("addE('exit')")) {
            const fromId = bindings?.fid as string
            const toId = bindings?.tid as string
            const dir = bindings?.dir as string
            const desc = bindings?.desc as string
            if (!this.data.exits[fromId]) {
                this.data.exits[fromId] = []
            }
            this.data.exits[fromId].push({ direction: dir, to: toId, description: desc })
            return []
        }
        // Return empty for unknown queries to avoid hanging
        return []
    }
}

test('cosmos location repository get + move', async () => {
    const locA: Record<string, unknown> = { id: 'A', name: ['Alpha'], description: ['Location A'] }
    const locB: Record<string, unknown> = { id: 'B', name: ['Beta'], description: ['Location B'] }
    const exitsA = [{ direction: 'north', to: 'B', description: 'to beta' }]
    const fake = new FakeGremlinClient({ locations: { A: locA, B: locB }, exits: { A: exitsA as ExitArray, B: [] } })
    const repo = new CosmosLocationRepository(fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> })
    const gotA = await repo.get('A')
    assert.ok(gotA)
    assert.equal(gotA?.exits?.length, 1)
    const move = await repo.move('A', 'north')
    assert.equal(move.status, 'ok')
    assert.equal((move as { status: string; location: { id: string } }).location.id, 'B')
    const bad = await repo.move('A', 'south')
    assert.equal(bad.status, 'error')
})

test('cosmos location repository upsert - create new location', async () => {
    const fake = new FakeGremlinClient({ locations: {}, exits: {} })
    const repo = new CosmosLocationRepository(fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> })

    const newLocation = {
        id: 'test-123',
        name: 'Test Location',
        description: 'A test location for unit tests',
        tags: ['test', 'unit-test']
    }

    const result = await repo.upsert(newLocation)
    assert.equal(result.created, true)
    assert.equal(result.id, 'test-123')
    assert.equal(result.updatedRevision, 1)

    const retrieved = await repo.get('test-123')
    assert.ok(retrieved)
    assert.equal(retrieved.name, 'Test Location')
    assert.equal(retrieved.description, 'A test location for unit tests')
    assert.equal(retrieved.version, 1)
})

test('cosmos location repository upsert - update existing location (revision increment)', async () => {
    const existingLocation = { id: 'existing-123', name: ['Existing'], description: ['Original description'], version: 2 }
    const fake = new FakeGremlinClient({ locations: { 'existing-123': existingLocation }, exits: {} })
    const repo = new CosmosLocationRepository(fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> })

    const updatedLocation = {
        id: 'existing-123',
        name: 'Updated Location',
        description: 'Updated description',
        tags: ['updated']
    }

    const result = await repo.upsert(updatedLocation)
    assert.equal(result.created, false)
    assert.equal(result.id, 'existing-123')
    assert.equal(result.updatedRevision, 3)

    const retrieved = await repo.get('existing-123')
    assert.ok(retrieved)
    assert.equal(retrieved.name, 'Updated Location')
    assert.equal(retrieved.description, 'Updated description')
    assert.equal(retrieved.version, 3)
})

test('cosmos location repository upsert - fetch stored vertex', async () => {
    const fake = new FakeGremlinClient({ locations: {}, exits: {} })
    const repo = new CosmosLocationRepository(fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> })

    const location = { id: 'A', name: 'Alpha', description: 'First location' }
    await repo.upsert(location)

    const gotA = await repo.get('A')
    assert.ok(gotA)
    assert.equal(gotA.name, 'Alpha')
    assert.equal(gotA.description, 'First location')
})

test('cosmos location repository upsert - idempotent (no content change)', async () => {
    const existingLocation = { id: 'same-123', name: ['Same'], description: ['Same description'], version: 5, tags: ['tag1', 'tag2'] }
    const fake = new FakeGremlinClient({ locations: { 'same-123': existingLocation }, exits: {} })
    const repo = new CosmosLocationRepository(fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> })

    const sameLocation = {
        id: 'same-123',
        name: 'Same',
        description: 'Same description',
        tags: ['tag1', 'tag2']
    }

    const result = await repo.upsert(sameLocation)
    assert.equal(result.created, false)
    assert.equal(result.updatedRevision, undefined)

    const retrieved = await repo.get('same-123')
    assert.ok(retrieved)
    assert.equal(retrieved.version, 5)
})

test('cosmos location repository upsert - revision increment on content change', async () => {
    const existingLocation = { id: 'change-123', name: ['Original'], description: ['Original description'], version: 1 }
    const fake = new FakeGremlinClient({ locations: { 'change-123': existingLocation }, exits: {} })
    const repo = new CosmosLocationRepository(fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> })

    const changedLocation = {
        id: 'change-123',
        name: 'Changed',
        description: 'Changed description'
    }

    const result = await repo.upsert(changedLocation)
    assert.equal(result.updatedRevision, 2)

    const retrieved = await repo.get('change-123')
    assert.ok(retrieved)
    assert.equal(retrieved.version, 2)
})

test('cosmos location repository upsert - tag order does not affect hash', async () => {
    const existingLocation = { id: 'tags-123', name: ['Location'], description: ['Description'], version: 1, tags: ['a', 'b', 'c'] }
    const fake = new FakeGremlinClient({ locations: { 'tags-123': existingLocation }, exits: {} })
    const repo = new CosmosLocationRepository(fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> })

    const sameLocationDifferentOrder = {
        id: 'tags-123',
        name: 'Location',
        description: 'Description',
        tags: ['c', 'b', 'a']
    }

    const result = await repo.upsert(sameLocationDifferentOrder)
    assert.equal(result.updatedRevision, undefined)
})

test('cosmos location repository get - unknown id returns undefined', async () => {
    const fake = new FakeGremlinClient({ locations: {}, exits: {} })
    const repo = new CosmosLocationRepository(fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> })
    const result = await repo.get('unknown-id')
    assert.equal(result, undefined)
})

test('cosmos location repository upsert - validation error for missing fields', async () => {
    const fake = new FakeGremlinClient({ locations: {}, exits: {} })
    const repo = new CosmosLocationRepository(fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> })

    await assert.rejects(async () => {
        await repo.upsert({ id: 'test', name: 'Test' } as any)
    }, /Location missing required fields/)
})

test('cosmos location repository - exits summary cache invalidation on ensureExit', async () => {
    const locA = { id: 'A', name: ['A'], description: ['Location A'], exitsSummaryCache: ['old-cache'] }
    const locB = { id: 'B', name: ['B'], description: ['Location B'] }
    const fake = new FakeGremlinClient({ locations: { A: locA, B: locB }, exits: {} })
    const repo = new CosmosLocationRepository(fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> })

    await repo.ensureExit('A', 'north', 'B')
    const retrieved = await repo.get('A')
    assert.ok(retrieved)
})

test('cosmos location repository - exits summary cache invalidation on removeExit', async () => {
    const locA = { id: 'A', name: ['A'], description: ['Location A'], exitsSummaryCache: ['old-cache'] }
    const fake = new FakeGremlinClient({ locations: { A: locA }, exits: { A: [{ direction: 'north', to: 'B' }] } })
    const repo = new CosmosLocationRepository(fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> })

    await repo.removeExit('A', 'north')
    const retrieved = await repo.get('A')
    assert.ok(retrieved)
})

test('cosmos location repository - exits summary cache with multiple exits', async () => {
    const locA = { id: 'A', name: ['A'], description: ['Location A'] }
    const fake = new FakeGremlinClient({ locations: { A: locA, B: {}, C: {} }, exits: {} })
    const repo = new CosmosLocationRepository(fake as unknown as { submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]> })

    await repo.ensureExit('A', 'north', 'B')
    await repo.ensureExit('A', 'east', 'C')
    const retrieved = await repo.get('A')
    assert.ok(retrieved)
    assert.equal(retrieved.exits?.length, 2)
})
