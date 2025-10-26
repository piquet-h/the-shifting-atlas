import { Location } from '@piquet-h/shared'
import assert from 'node:assert'
import { describe, test } from 'node:test'
import type { IGremlinClient } from '../../src/gremlin/gremlinClient.js'
import { CosmosLocationRepository } from '../../src/repos/locationRepository.cosmos.js'
import { InMemoryLocationRepository } from '../../src/repos/locationRepository.js'

describe('Location Repository', () => {
    // Mock GremlinClient for unit testing CosmosLocationRepository
    class MockGremlinClient {
        private data: Map<string, Record<string, unknown>> = new Map()
        private edges: Map<string, Array<Record<string, unknown>>> = new Map()

        async submit<T>(query: string, bindings?: Record<string, unknown>): Promise<T[]> {
            // Handle get location queries
            if (query.includes('valueMap(true)')) {
                const id = bindings?.locationId || bindings?.lid
                const vertex = this.data.get(String(id))
                return vertex ? [vertex as T] : []
            }

            // Handle exit queries
            if (query.includes("outE('exit')")) {
                const locationId = bindings?.locationId || bindings?.fid
                const edges = this.edges.get(String(locationId)) || []

                // If checking for existing edge with where clause
                if (query.includes('where(inV()')) {
                    const dir = bindings?.dir
                    const tid = bindings?.tid
                    return edges.filter((e) => e.direction === dir && e.to === tid) as T[]
                }

                return edges as T[]
            }

            // Handle vertex upsert
            if (query.includes('fold().coalesce(unfold(), addV')) {
                const id = bindings?.lid || bindings?.fid || bindings?.tid
                const name = bindings?.name
                const desc = bindings?.desc
                const ver = bindings?.ver

                if (id) {
                    this.data.set(String(id), {
                        id: id,
                        name: name ? [name] : ['Test Location'],
                        description: desc ? [desc] : [''],
                        version: ver || 1
                    })
                }
                return []
            }

            // Handle edge creation
            if (query.includes("addE('exit')")) {
                const fromId = bindings?.fid
                const toId = bindings?.tid
                const dir = bindings?.dir
                const desc = bindings?.desc

                if (fromId && toId && dir) {
                    const edges = this.edges.get(String(fromId)) || []
                    edges.push({ direction: dir, to: toId, description: desc || '' })
                    this.edges.set(String(fromId), edges)
                }
                return []
            }

            // Handle cache update
            if (query.includes("property('exitsSummaryCache'")) {
                const id = bindings?.locationId
                const cache = bindings?.cache
                const vertex = this.data.get(String(id))
                if (vertex) {
                    vertex.exitsSummaryCache = [cache]
                }
                return []
            }

            return []
        }
    }

    describe('InMemoryLocationRepository', () => {
        test('get returns location', async () => {
            const repo = new InMemoryLocationRepository()
            const location = await repo.get('a4d1c3f1-5b2a-4f7d-9d4b-8f0c2a6b7e21') // Mosswell River Jetty

            assert.ok(location)
            assert.equal(location.name, 'Mosswell River Jetty')
        })

        test('move with valid exit', async () => {
            const repo = new InMemoryLocationRepository()
            // Mosswell River Jetty has a 'south' exit to North Road
            const result = await repo.move('a4d1c3f1-5b2a-4f7d-9d4b-8f0c2a6b7e21', 'south')

            assert.equal(result.status, 'ok')
            assert.ok(result.location)
        })

        test('move with invalid exit returns error', async () => {
            const repo = new InMemoryLocationRepository()
            const result = await repo.move('a4d1c3f1-5b2a-4f7d-9d4b-8f0c2a6b7e21', 'up')

            assert.equal(result.status, 'error')
            assert.equal(result.reason, 'no-exit')
        })

        test('upsert creates new location', async () => {
            const repo = new InMemoryLocationRepository()
            const newLoc: Location = {
                id: 'test-loc',
                name: 'Test Location',
                description: 'A test location',
                exits: []
            }

            const result = await repo.upsert(newLoc)

            assert.equal(result.created, true)
            assert.equal(result.id, 'test-loc')

            const retrieved = await repo.get('test-loc')
            assert.ok(retrieved)
            assert.equal(retrieved.name, 'Test Location')
        })

        test('upsert existing location updates', async () => {
            const repo = new InMemoryLocationRepository()
            const existingLoc: Location = {
                id: 'a4d1c3f1-5b2a-4f7d-9d4b-8f0c2a6b7e21',
                name: 'Updated Jetty',
                description: 'Updated description',
                exits: []
            }

            const result = await repo.upsert(existingLoc)

            assert.equal(result.created, false)
            assert.ok(result.updatedRevision)

            const retrieved = await repo.get('a4d1c3f1-5b2a-4f7d-9d4b-8f0c2a6b7e21')
            assert.ok(retrieved)
            assert.equal(retrieved.name, 'Updated Jetty')
        })
    })

    describe('CosmosLocationRepository', () => {
        test('get returns location', async () => {
            const mockClient = new MockGremlinClient()
            await mockClient.submit("g.V(lid).fold().coalesce(unfold(), addV('location'))", {
                lid: 'test-id',
                name: 'Test',
                desc: 'Test location',
                ver: 1,
                pk: 'test'
            })

            const repo = new CosmosLocationRepository(mockClient as unknown as IGremlinClient)
            const location = await repo.get('test-id')

            assert.ok(location)
            assert.equal(location.name, 'Test')
        })

        test('upsert creates new location', async () => {
            const mockClient = new MockGremlinClient()
            const repo = new CosmosLocationRepository(mockClient as unknown as IGremlinClient)

            const newLoc: Location = {
                id: 'new-loc',
                name: 'New Location',
                description: 'A new test location',
                exits: []
            }

            const result = await repo.upsert(newLoc)

            assert.equal(result.created, true)
            assert.equal(result.id, 'new-loc')
        })

        test('ensureExit creates exit idempotently', async () => {
            const mockClient = new MockGremlinClient()
            const repo = new CosmosLocationRepository(mockClient as unknown as IGremlinClient)

            // First call should create
            const result1 = await repo.ensureExit('loc-a', 'north', 'loc-b')
            assert.equal(result1.created, true)

            // Second call should be idempotent
            const result2 = await repo.ensureExit('loc-a', 'north', 'loc-b')
            assert.equal(result2.created, false)
        })
    })
})
