import assert from 'node:assert'
import {test} from 'node:test'
import {CosmosLocationRepository} from '../src/repos/locationRepository.cosmos.js'

type VertexMap = Record<string, Record<string, unknown>>
type ExitArray = Array<Record<string, unknown>>

class FakeGremlinClient {
    constructor(private data: {locations: VertexMap; exits: Record<string, ExitArray>}) {}
    async submit<T>(query: string, bindings?: Record<string, unknown>): Promise<T[]> {
        if (query.startsWith('g.V') && query.includes('valueMap(true)')) {
            const id = bindings?.locationId || (bindings?.lid as string)
            const r = this.data.locations[id]
            return r ? [r as T] : []
        }
        if (query.includes("outE('exit')")) {
            const id = bindings?.locationId as string
            return (this.data.exits[id] || []) as unknown as T[]
        }
        if (query.includes('fold().coalesce(unfold(), addV')) {
            // Upsert operation - update or create the location
            const id = bindings?.lid as string
            const name = bindings?.name as string
            const desc = bindings?.desc as string
            const ver = bindings?.ver as number
            const tags = bindings?.tags as string[] | undefined

            this.data.locations[id] = {
                id: id,
                name: [name],
                description: [desc],
                version: ver,
                ...(tags && tags.length > 0 ? {tags: tags} : {})
            }
            return []
        }
        throw new Error('Unexpected query: ' + query)
    }
}

test('cosmos location repository get + move', async () => {
    const locA: Record<string, unknown> = {id: 'A', name: ['Alpha'], description: ['Location A']}
    const locB: Record<string, unknown> = {id: 'B', name: ['Beta'], description: ['Location B']}
    const exitsA = [{direction: 'north', to: 'B', description: 'to beta'}]
    const fake = new FakeGremlinClient({locations: {A: locA, B: locB}, exits: {A: exitsA as ExitArray, B: []}})
    const repo = new CosmosLocationRepository(fake as unknown as {submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]>})
    const gotA = await repo.get('A')
    assert.ok(gotA)
    assert.equal(gotA?.exits?.length, 1)
    const move = await repo.move('A', 'north')
    assert.equal(move.status, 'ok')
    assert.equal((move as {status: string; location: {id: string}}).location.id, 'B')
    const bad = await repo.move('A', 'south')
    assert.equal(bad.status, 'error')
})

test('cosmos location repository upsert - create new location', async () => {
    const fake = new FakeGremlinClient({locations: {}, exits: {}})
    const repo = new CosmosLocationRepository(fake as unknown as {submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]>})

    const newLocation = {
        id: 'test-123',
        name: 'Test Location',
        description: 'A test location for unit tests',
        tags: ['test', 'unit-test']
    }

    const result = await repo.upsert(newLocation)
    assert.equal(result.created, true)
    assert.equal(result.id, 'test-123')

    // Verify it was stored correctly
    const retrieved = await repo.get('test-123')
    assert.ok(retrieved)
    assert.equal(retrieved.name, 'Test Location')
    assert.equal(retrieved.description, 'A test location for unit tests')
    assert.equal(retrieved.version, 1)
})

test('cosmos location repository upsert - update existing location (revision increment)', async () => {
    const existingLocation = {id: 'existing-123', name: ['Existing'], description: ['Original description'], version: 2}
    const fake = new FakeGremlinClient({locations: {'existing-123': existingLocation}, exits: {}})
    const repo = new CosmosLocationRepository(fake as unknown as {submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]>})

    const updatedLocation = {
        id: 'existing-123',
        name: 'Updated Location',
        description: 'Updated description',
        tags: ['updated']
    }

    const result = await repo.upsert(updatedLocation)
    assert.equal(result.created, false)
    assert.equal(result.id, 'existing-123')

    // Verify the version was incremented
    const retrieved = await repo.get('existing-123')
    assert.ok(retrieved)
    assert.equal(retrieved.name, 'Updated Location')
    assert.equal(retrieved.description, 'Updated description')
    assert.equal(retrieved.version, 3) // Should be incremented from 2 to 3
})

test('cosmos location repository upsert - fetch stored vertex', async () => {
    const fake = new FakeGremlinClient({locations: {}, exits: {}})
    const repo = new CosmosLocationRepository(fake as unknown as {submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]>})

    const location = {
        id: 'fetch-test',
        name: 'Fetchable Location',
        description: 'This location will be fetched after storing',
        tags: ['fetch', 'test'],
        version: 5
    }

    await repo.upsert(location)
    const fetched = await repo.get('fetch-test')

    // Verify stable shape and all properties
    assert.ok(fetched)
    assert.equal(fetched.id, 'fetch-test')
    assert.equal(fetched.name, 'Fetchable Location')
    assert.equal(fetched.description, 'This location will be fetched after storing')
    assert.ok(Array.isArray(fetched.tags))
    assert.equal(fetched.tags?.length, 2)
    assert.equal(fetched.tags?.[0], 'fetch')
    assert.equal(fetched.tags?.[1], 'test')
    assert.equal(typeof fetched.version, 'number')
    assert.equal(fetched.version, 5) // Version should be the input version for new location when specified
})
