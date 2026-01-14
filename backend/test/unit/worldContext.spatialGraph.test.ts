import { randomUUID } from 'crypto'
import assert from 'node:assert'
import { beforeEach, describe, test } from 'node:test'
import { getSpatialContext } from '../../src/handlers/mcp/world-context/world-context.js'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'

type LocationRecord = {
    id: string
    name: string
    description: string
    exits: unknown[]
}

type LocationRepoOverride = {
    get: () => Promise<LocationRecord | undefined>
    query: (
        query: string,
        bindings: {
            locationId: string
            maxDepth: number
        }
    ) => Promise<Array<{ id: string; name: string; depth: number; path: string[] }>>
}

describe('WorldContext getSpatialContext (unit)', () => {
    let fixture: UnitTestFixture

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
    })

    test('returns N-hop neighbors with depth 1', async () => {
        const locationId = randomUUID()
        const neighbor1 = randomUUID()

        // Setup: location with one neighbor
        const mockNeighbors = [
            {
                id: neighbor1,
                name: 'Neighbor 1',
                depth: 1,
                direction: 'north'
            }
        ]

        // Mock location repository to return location and spatial neighbors
        const locationRepo = await fixture.getLocationRepository()
        ;(locationRepo as unknown as LocationRepoOverride).get = async () => ({
            id: locationId,
            name: 'Test Location',
            description: 'A test location',
            exits: []
        })
        ;(locationRepo as unknown as LocationRepoOverride).query = async (query: string, bindings) => {
            assert.equal(bindings.locationId, locationId)
            assert.equal(bindings.maxDepth, 1)
            return mockNeighbors.map((n) => ({
                id: n.id,
                name: n.name,
                depth: n.depth,
                path: [n.direction]
            }))
        }

        const context = await fixture.createInvocationContext()
        const result = await getSpatialContext({ arguments: { locationId, depth: 1 } }, context)
        const parsed = JSON.parse(result)

        assert.equal(parsed.locationId, locationId)
        assert.equal(parsed.depth, 1)
        assert.ok(Array.isArray(parsed.neighbors))
        assert.equal(parsed.neighbors.length, 1)
        assert.equal(parsed.neighbors[0].id, neighbor1)
        assert.equal(parsed.neighbors[0].depth, 1)
    })

    test('returns N-hop neighbors with depth 2 (default)', async () => {
        const locationId = randomUUID()

        const mockNeighbors = [
            { id: randomUUID(), name: 'Depth 1', depth: 1, path: ['north'] },
            { id: randomUUID(), name: 'Depth 2', depth: 2, path: ['north', 'east'] }
        ]

        const locationRepo = await fixture.getLocationRepository()
        ;(locationRepo as unknown as LocationRepoOverride).get = async () => ({
            id: locationId,
            name: 'Test Location',
            description: 'A test location',
            exits: []
        })
        ;(locationRepo as unknown as LocationRepoOverride).query = async (query: string, bindings) => {
            assert.equal(bindings.maxDepth, 2) // default depth
            return mockNeighbors
        }

        const context = await fixture.createInvocationContext()
        const result = await getSpatialContext({ arguments: { locationId } }, context)
        const parsed = JSON.parse(result)

        assert.equal(parsed.depth, 2)
        assert.equal(parsed.neighbors.length, 2)
    })

    test('clamps depth to maximum of 5 hops and logs warning', async () => {
        const locationId = randomUUID()

        const mockNeighbors = [{ id: randomUUID(), name: 'Neighbor', depth: 5, path: ['north'] }]

        const locationRepo = await fixture.getLocationRepository()
        ;(locationRepo as unknown as LocationRepoOverride).get = async () => ({
            id: locationId,
            name: 'Test Location',
            description: 'A test location',
            exits: []
        })
        ;(locationRepo as unknown as LocationRepoOverride).query = async (query: string, bindings) => {
            assert.equal(bindings.maxDepth, 5) // clamped from 10
            return mockNeighbors
        }

        const context = await fixture.createInvocationContext()
        const result = await getSpatialContext({ arguments: { locationId, depth: 10 } }, context)
        const parsed = JSON.parse(result)

        assert.equal(parsed.depth, 5)
        assert.equal(parsed.requestedDepth, 10)
        assert.ok(parsed.warnings)
        assert.ok(parsed.warnings.includes('depth clamped to maximum of 5'))
    })

    test('returns empty array when no neighbors exist', async () => {
        const locationId = randomUUID()

        const locationRepo = await fixture.getLocationRepository()
        ;(locationRepo as unknown as LocationRepoOverride).get = async () => ({
            id: locationId,
            name: 'Test Location',
            description: 'A test location',
            exits: []
        })
        ;(locationRepo as unknown as LocationRepoOverride).query = async () => []

        const context = await fixture.createInvocationContext()
        const result = await getSpatialContext({ arguments: { locationId, depth: 2 } }, context)
        const parsed = JSON.parse(result)

        assert.equal(parsed.neighbors.length, 0)
    })

    test('returns null when location does not exist', async () => {
        const locationId = randomUUID()

        const locationRepo = await fixture.getLocationRepository()
        ;(locationRepo as unknown as LocationRepoOverride).get = async () => undefined

        const context = await fixture.createInvocationContext()
        const result = await getSpatialContext({ arguments: { locationId } }, context)
        const parsed = JSON.parse(result)

        assert.equal(parsed, null)
    })

    test('handles disconnected graph regions by returning only reachable nodes', async () => {
        const locationId = randomUUID()

        // Isolated location with no connections
        const mockNeighbors: Array<{ id: string; name: string; depth: number; path: string[] }> = []

        const locationRepo = await fixture.getLocationRepository()
        ;(locationRepo as unknown as LocationRepoOverride).get = async () => ({
            id: locationId,
            name: 'Test Location',
            description: 'A test location',
            exits: []
        })
        ;(locationRepo as unknown as LocationRepoOverride).query = async () => mockNeighbors

        const context = await fixture.createInvocationContext()
        const result = await getSpatialContext({ arguments: { locationId, depth: 3 } }, context)
        const parsed = JSON.parse(result)

        assert.ok(Array.isArray(parsed.neighbors))
        assert.equal(parsed.neighbors.length, 0)
    })
})
