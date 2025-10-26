import assert from 'node:assert'
import { describe, test } from 'node:test'

describe('Exit Graph Consistency Scanner', () => {
    /**
     * Tests for Exit Graph Consistency Scanner
     *
     * Uses synthetic in-memory graph fixtures to verify scanner logic.
     */

interface Location {
    id: string
    name: string | string[]
    tags?: string[]
}

interface Exit {
    id: string
    from: string
    to: string
    direction: string
}

interface GraphFixtures {
    locations: Location[]
    exits: Exit[]
}

interface DanglingExit {
    fromLocationId: string
    toLocationId: string
    direction: string
    edgeId: string
}

interface OrphanLocation {
    id: string
    name: string
    tags: string[]
}

interface ScanResults {
    scannedAt: string
    summary: {
        totalLocations: number
        totalExits: number
        danglingExitsCount: number
        orphanLocationsCount: number
    }
    danglingExits: DanglingExit[]
    orphanLocations: OrphanLocation[]
}

// Mock scanner function that works with fixtures
async function scanGraphConsistencyWithMock(fixtures: GraphFixtures, seedLocations: string[] = []): Promise<ScanResults> {
    const SEED_LOCATION_IDS = new Set(['village-square', 'spawn', 'start', 'entrance', ...seedLocations])

    const scannedAt = new Date().toISOString()
    const results: ScanResults = {
        scannedAt,
        summary: {
            totalLocations: 0,
            totalExits: 0,
            danglingExitsCount: 0,
            orphanLocationsCount: 0
        },
        danglingExits: [],
        orphanLocations: []
    }

    const locations = fixtures.locations
    results.summary.totalLocations = locations.length

    if (locations.length === 0) {
        return results
    }

    const locationIds = new Set(locations.map((loc) => String(loc.id)))
    const locationsWithConnections = new Set()

    const exits = fixtures.exits
    results.summary.totalExits = exits.length

    for (const exit of exits) {
        const fromId = String(exit.from)
        const toId = String(exit.to)
        const direction = String(exit.direction)

        locationsWithConnections.add(fromId)
        locationsWithConnections.add(toId)

        if (!locationIds.has(toId)) {
            results.danglingExits.push({
                fromLocationId: fromId,
                toLocationId: toId,
                direction: direction,
                edgeId: String(exit.id)
            })
        }
    }

    results.summary.danglingExitsCount = results.danglingExits.length

    for (const loc of locations) {
        const locationId = String(loc.id)

        if (!locationsWithConnections.has(locationId) && !SEED_LOCATION_IDS.has(locationId)) {
            results.orphanLocations.push({
                id: locationId,
                name: Array.isArray(loc.name) ? loc.name[0] : String(loc.name || 'Unknown'),
                tags: Array.isArray(loc.tags) ? loc.tags : []
            })
        }
    }

    results.summary.orphanLocationsCount = results.orphanLocations.length

    return results
}

test('scanner - empty graph returns zero counts', async () => {
    const fixtures = {
        locations: [],
        exits: []
    }

    const results = await scanGraphConsistencyWithMock(fixtures)

    assert.equal(results.summary.totalLocations, 0)
    assert.equal(results.summary.totalExits, 0)
    assert.equal(results.summary.danglingExitsCount, 0)
    assert.equal(results.summary.orphanLocationsCount, 0)
    assert.equal(results.danglingExits.length, 0)
    assert.equal(results.orphanLocations.length, 0)
})

test('scanner - detects dangling exit to non-existent location', async () => {
    const fixtures = {
        locations: [{ id: 'A', name: ['Location A'], tags: [] }],
        exits: [
            { id: 'edge1', from: 'A', to: 'B', direction: 'north' } // B doesn't exist
        ]
    }

    const results = await scanGraphConsistencyWithMock(fixtures)

    assert.equal(results.summary.danglingExitsCount, 1)
    assert.equal(results.danglingExits.length, 1)
    assert.equal(results.danglingExits[0].fromLocationId, 'A')
    assert.equal(results.danglingExits[0].toLocationId, 'B')
    assert.equal(results.danglingExits[0].direction, 'north')
})

test('scanner - all reciprocal exits produce no false positives', async () => {
    const fixtures = {
        locations: [
            { id: 'A', name: ['Location A'], tags: [] },
            { id: 'B', name: ['Location B'], tags: [] }
        ],
        exits: [
            { id: 'edge1', from: 'A', to: 'B', direction: 'north' },
            { id: 'edge2', from: 'B', to: 'A', direction: 'south' }
        ]
    }

    const results = await scanGraphConsistencyWithMock(fixtures)

    assert.equal(results.summary.danglingExitsCount, 0)
    assert.equal(results.danglingExits.length, 0)
})

test('scanner - detects orphan location not in seed list', async () => {
    const fixtures = {
        locations: [
            { id: 'A', name: ['Location A'], tags: [] },
            { id: 'B', name: ['Location B'], tags: [] },
            { id: 'orphan', name: ['Orphaned Room'], tags: ['isolated'] }
        ],
        exits: [{ id: 'edge1', from: 'A', to: 'B', direction: 'north' }]
    }

    const results = await scanGraphConsistencyWithMock(fixtures)

    assert.equal(results.summary.orphanLocationsCount, 1)
    assert.equal(results.orphanLocations.length, 1)
    assert.equal(results.orphanLocations[0].id, 'orphan')
    assert.equal(results.orphanLocations[0].name, 'Orphaned Room')
})

test('scanner - seed locations not flagged as orphans', async () => {
    const fixtures = {
        locations: [
            { id: 'spawn', name: ['Spawn Point'], tags: [] },
            { id: 'A', name: ['Location A'], tags: [] }
        ],
        exits: []
    }

    const results = await scanGraphConsistencyWithMock(fixtures)

    // spawn is in default seed list, A is not
    assert.equal(results.summary.orphanLocationsCount, 1)
    assert.equal(results.orphanLocations[0].id, 'A')
})

test('scanner - custom seed locations respected', async () => {
    const fixtures = {
        locations: [{ id: 'custom-start', name: ['Custom Start'], tags: [] }],
        exits: []
    }

    const results = await scanGraphConsistencyWithMock(fixtures, ['custom-start'])

    // Should not be flagged as orphan
    assert.equal(results.summary.orphanLocationsCount, 0)
})

test('scanner - multiple dangling exits detected', async () => {
    const fixtures = {
        locations: [{ id: 'A', name: ['Location A'], tags: [] }],
        exits: [
            { id: 'edge1', from: 'A', to: 'B', direction: 'north' },
            { id: 'edge2', from: 'A', to: 'C', direction: 'east' },
            { id: 'edge3', from: 'A', to: 'D', direction: 'south' }
        ]
    }

    const results = await scanGraphConsistencyWithMock(fixtures)

    assert.equal(results.summary.danglingExitsCount, 3)
    assert.equal(results.danglingExits.length, 3)
})

test('scanner - mixed valid and dangling exits', async () => {
    const fixtures = {
        locations: [
            { id: 'A', name: ['Location A'], tags: [] },
            { id: 'B', name: ['Location B'], tags: [] }
        ],
        exits: [
            { id: 'edge1', from: 'A', to: 'B', direction: 'north' }, // Valid
            { id: 'edge2', from: 'A', to: 'C', direction: 'east' }, // Dangling
            { id: 'edge3', from: 'B', to: 'A', direction: 'south' } // Valid
        ]
    }

    const results = await scanGraphConsistencyWithMock(fixtures)

    assert.equal(results.summary.totalExits, 3)
    assert.equal(results.summary.danglingExitsCount, 1)
    assert.equal(results.danglingExits[0].toLocationId, 'C')
})

test('scanner - locations with only outbound connections not orphans', async () => {
    const fixtures = {
        locations: [
            { id: 'A', name: ['Location A'], tags: [] },
            { id: 'B', name: ['Location B'], tags: [] }
        ],
        exits: [{ id: 'edge1', from: 'A', to: 'B', direction: 'north' }]
    }

    const results = await scanGraphConsistencyWithMock(fixtures)

    // Both A and B have connections (A outbound, B inbound)
    assert.equal(results.summary.orphanLocationsCount, 0)
})

test('scanner - summary counts match detail arrays', async () => {
    const fixtures = {
        locations: [
            { id: 'A', name: ['Location A'], tags: [] },
            { id: 'orphan1', name: ['Orphan 1'], tags: [] },
            { id: 'orphan2', name: ['Orphan 2'], tags: [] }
        ],
        exits: [
            { id: 'edge1', from: 'A', to: 'missing1', direction: 'north' },
            { id: 'edge2', from: 'A', to: 'missing2', direction: 'east' }
        ]
    }

    const results = await scanGraphConsistencyWithMock(fixtures)

    assert.equal(results.summary.danglingExitsCount, results.danglingExits.length)
    assert.equal(results.summary.orphanLocationsCount, results.orphanLocations.length)
    assert.equal(results.danglingExits.length, 2)
    assert.equal(results.orphanLocations.length, 2)
})
})
