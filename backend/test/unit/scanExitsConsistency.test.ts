import assert from 'node:assert'
import { describe, test } from 'node:test'
import { getOppositeDirection, isDirection, Direction } from '@piquet-h/shared'

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

    interface MissingReciprocalExit {
        fromLocationId: string
        toLocationId: string
        direction: string
        expectedReverseDirection: string
    }

    interface ScanResults {
        scannedAt: string
        summary: {
            totalLocations: number
            totalExits: number
            danglingExitsCount: number
            orphanLocationsCount: number
            missingReciprocalCount: number
        }
        danglingExits: DanglingExit[]
        orphanLocations: OrphanLocation[]
        missingReciprocalExits: MissingReciprocalExit[]
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
                orphanLocationsCount: 0,
                missingReciprocalCount: 0
            },
            danglingExits: [],
            orphanLocations: [],
            missingReciprocalExits: []
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

        // Build exit map for reciprocity checking: (fromId, direction) -> toId
        const exitMap = new Map<string, string>()
        for (const exit of exits) {
            const fromId = String(exit.from)
            const toId = String(exit.to)
            const direction = String(exit.direction)
            exitMap.set(`${fromId}|${direction}`, toId)
        }

        // Check for missing reciprocal exits
        for (const exit of exits) {
            const fromId = String(exit.from)
            const toId = String(exit.to)
            const direction = String(exit.direction)

            // Skip if either location doesn't exist (dangling exit case)
            if (!locationIds.has(fromId) || !locationIds.has(toId)) {
                continue
            }

            // Skip if direction is not a canonical direction (edge case: custom/invalid)
            if (!isDirection(direction)) {
                continue
            }

            const expectedReverseDirection = getOppositeDirection(direction as Direction)
            const reverseExitKey = `${toId}|${expectedReverseDirection}`

            // Check if the reverse exit exists and points back to the original location
            const reverseTarget = exitMap.get(reverseExitKey)
            if (reverseTarget !== fromId) {
                results.missingReciprocalExits.push({
                    fromLocationId: fromId,
                    toLocationId: toId,
                    direction: direction,
                    expectedReverseDirection: expectedReverseDirection
                })
            }
        }

        results.summary.missingReciprocalCount = results.missingReciprocalExits.length

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
        assert.equal(results.summary.missingReciprocalCount, 0)
        assert.equal(results.danglingExits.length, 0)
        assert.equal(results.orphanLocations.length, 0)
        assert.equal(results.missingReciprocalExits.length, 0)
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
        assert.equal(results.summary.missingReciprocalCount, 0)
        assert.equal(results.missingReciprocalExits.length, 0)
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
        assert.equal(results.summary.missingReciprocalCount, results.missingReciprocalExits.length)
        assert.equal(results.danglingExits.length, 2)
        assert.equal(results.orphanLocations.length, 2)
    })

    // === Exit Reciprocity Tests ===

    test('scanner - detects missing reciprocal exit', async () => {
        const fixtures = {
            locations: [
                { id: 'forest-clearing', name: ['Forest Clearing'], tags: [] },
                { id: 'dark-cave', name: ['Dark Cave'], tags: [] }
            ],
            exits: [
                { id: 'edge1', from: 'forest-clearing', to: 'dark-cave', direction: 'north' }
                // Missing: edge from dark-cave to forest-clearing going south
            ]
        }

        const results = await scanGraphConsistencyWithMock(fixtures)

        assert.equal(results.summary.missingReciprocalCount, 1)
        assert.equal(results.missingReciprocalExits.length, 1)
        assert.equal(results.missingReciprocalExits[0].fromLocationId, 'forest-clearing')
        assert.equal(results.missingReciprocalExits[0].toLocationId, 'dark-cave')
        assert.equal(results.missingReciprocalExits[0].direction, 'north')
        assert.equal(results.missingReciprocalExits[0].expectedReverseDirection, 'south')
    })

    test('scanner - detects multiple missing reciprocal exits', async () => {
        const fixtures = {
            locations: [
                { id: 'A', name: ['Location A'], tags: [] },
                { id: 'B', name: ['Location B'], tags: [] },
                { id: 'C', name: ['Location C'], tags: [] }
            ],
            exits: [
                { id: 'edge1', from: 'A', to: 'B', direction: 'north' },
                { id: 'edge2', from: 'A', to: 'C', direction: 'east' }
                // Missing: B→A south and C→A west
            ]
        }

        const results = await scanGraphConsistencyWithMock(fixtures)

        assert.equal(results.summary.missingReciprocalCount, 2)
        assert.equal(results.missingReciprocalExits.length, 2)
    })

    test('scanner - diagonal directions paired correctly (northeast ↔ southwest)', async () => {
        const fixtures = {
            locations: [
                { id: 'A', name: ['Location A'], tags: [] },
                { id: 'B', name: ['Location B'], tags: [] }
            ],
            exits: [
                { id: 'edge1', from: 'A', to: 'B', direction: 'northeast' },
                { id: 'edge2', from: 'B', to: 'A', direction: 'southwest' }
            ]
        }

        const results = await scanGraphConsistencyWithMock(fixtures)

        assert.equal(results.summary.missingReciprocalCount, 0)
    })

    test('scanner - diagonal directions paired correctly (northwest ↔ southeast)', async () => {
        const fixtures = {
            locations: [
                { id: 'A', name: ['Location A'], tags: [] },
                { id: 'B', name: ['Location B'], tags: [] }
            ],
            exits: [
                { id: 'edge1', from: 'A', to: 'B', direction: 'northwest' },
                { id: 'edge2', from: 'B', to: 'A', direction: 'southeast' }
            ]
        }

        const results = await scanGraphConsistencyWithMock(fixtures)

        assert.equal(results.summary.missingReciprocalCount, 0)
    })

    test('scanner - special directions paired correctly (up ↔ down)', async () => {
        const fixtures = {
            locations: [
                { id: 'basement', name: ['Basement'], tags: [] },
                { id: 'ground-floor', name: ['Ground Floor'], tags: [] }
            ],
            exits: [
                { id: 'edge1', from: 'basement', to: 'ground-floor', direction: 'up' },
                { id: 'edge2', from: 'ground-floor', to: 'basement', direction: 'down' }
            ]
        }

        const results = await scanGraphConsistencyWithMock(fixtures)

        assert.equal(results.summary.missingReciprocalCount, 0)
    })

    test('scanner - special directions paired correctly (in ↔ out)', async () => {
        const fixtures = {
            locations: [
                { id: 'outside', name: ['Outside'], tags: [] },
                { id: 'inside', name: ['Inside'], tags: [] }
            ],
            exits: [
                { id: 'edge1', from: 'outside', to: 'inside', direction: 'in' },
                { id: 'edge2', from: 'inside', to: 'outside', direction: 'out' }
            ]
        }

        const results = await scanGraphConsistencyWithMock(fixtures)

        assert.equal(results.summary.missingReciprocalCount, 0)
    })

    test('scanner - detects missing diagonal reciprocal', async () => {
        const fixtures = {
            locations: [
                { id: 'A', name: ['Location A'], tags: [] },
                { id: 'B', name: ['Location B'], tags: [] }
            ],
            exits: [
                { id: 'edge1', from: 'A', to: 'B', direction: 'northeast' }
                // Missing: B→A southwest
            ]
        }

        const results = await scanGraphConsistencyWithMock(fixtures)

        assert.equal(results.summary.missingReciprocalCount, 1)
        assert.equal(results.missingReciprocalExits[0].direction, 'northeast')
        assert.equal(results.missingReciprocalExits[0].expectedReverseDirection, 'southwest')
    })

    test('scanner - detects missing up/down reciprocal', async () => {
        const fixtures = {
            locations: [
                { id: 'lower', name: ['Lower Level'], tags: [] },
                { id: 'upper', name: ['Upper Level'], tags: [] }
            ],
            exits: [
                { id: 'edge1', from: 'lower', to: 'upper', direction: 'up' }
                // Missing: upper→lower down
            ]
        }

        const results = await scanGraphConsistencyWithMock(fixtures)

        assert.equal(results.summary.missingReciprocalCount, 1)
        assert.equal(results.missingReciprocalExits[0].direction, 'up')
        assert.equal(results.missingReciprocalExits[0].expectedReverseDirection, 'down')
    })

    test('scanner - non-canonical direction is skipped without error', async () => {
        const fixtures = {
            locations: [
                { id: 'A', name: ['Location A'], tags: [] },
                { id: 'B', name: ['Location B'], tags: [] }
            ],
            exits: [
                { id: 'edge1', from: 'A', to: 'B', direction: 'widdershins' } // Non-canonical
            ]
        }

        const results = await scanGraphConsistencyWithMock(fixtures)

        // Non-canonical direction should be skipped, not flagged as missing reciprocal
        assert.equal(results.summary.missingReciprocalCount, 0)
    })

    test('scanner - dangling exits not flagged for missing reciprocal', async () => {
        const fixtures = {
            locations: [{ id: 'A', name: ['Location A'], tags: [] }],
            exits: [
                { id: 'edge1', from: 'A', to: 'B', direction: 'north' } // B doesn't exist
            ]
        }

        const results = await scanGraphConsistencyWithMock(fixtures)

        // Should be flagged as dangling, not as missing reciprocal
        assert.equal(results.summary.danglingExitsCount, 1)
        assert.equal(results.summary.missingReciprocalCount, 0)
    })

    test('scanner - complex graph with mixed reciprocity', async () => {
        const fixtures = {
            locations: [
                { id: 'hub', name: ['Hub'], tags: [] },
                { id: 'north-room', name: ['North Room'], tags: [] },
                { id: 'east-room', name: ['East Room'], tags: [] },
                { id: 'west-room', name: ['West Room'], tags: [] }
            ],
            exits: [
                // Hub → North Room (bidirectional - OK)
                { id: 'edge1', from: 'hub', to: 'north-room', direction: 'north' },
                { id: 'edge2', from: 'north-room', to: 'hub', direction: 'south' },
                // Hub → East Room (one-way - missing reciprocal)
                { id: 'edge3', from: 'hub', to: 'east-room', direction: 'east' },
                // West Room → Hub (one-way - missing reciprocal from hub)
                { id: 'edge4', from: 'west-room', to: 'hub', direction: 'east' }
            ]
        }

        const results = await scanGraphConsistencyWithMock(fixtures)

        assert.equal(results.summary.missingReciprocalCount, 2)
        // The two missing reciprocals are: east-room→hub west, and hub→west-room west
    })

    test('scanner - seed locations included in reciprocity checks', async () => {
        const fixtures = {
            locations: [
                { id: 'spawn', name: ['Spawn Point'], tags: [] }, // Seed location
                { id: 'first-room', name: ['First Room'], tags: [] }
            ],
            exits: [
                { id: 'edge1', from: 'spawn', to: 'first-room', direction: 'north' }
                // Missing: first-room→spawn south
            ]
        }

        const results = await scanGraphConsistencyWithMock(fixtures)

        // Seed locations are excluded from orphan checks but NOT from reciprocity checks
        assert.equal(results.summary.orphanLocationsCount, 0) // Both have connections
        assert.equal(results.summary.missingReciprocalCount, 1) // Missing reciprocal detected
        assert.equal(results.missingReciprocalExits[0].fromLocationId, 'spawn')
        assert.equal(results.missingReciprocalExits[0].toLocationId, 'first-room')
    })
})
