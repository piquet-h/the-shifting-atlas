import type { Location } from '@piquet-h/shared'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { DEFAULT_FRONTIER_CAP, FRONTIER_BOUNDARY_TAG, selectFrontierExits } from '../../src/seeding/frontierSelectionPolicy.js'

// Minimal Location stub helpers
function makeLocation(overrides: Partial<Location>): Location {
    return {
        id: 'test-loc-id',
        name: 'Test Location',
        description: 'A test location.',
        ...overrides
    }
}

describe('selectFrontierExits', () => {
    describe('cap enforcement', () => {
        test('returns at most cap exits when pending count exceeds cap', () => {
            const location = makeLocation({
                exitAvailability: {
                    pending: {
                        north: 'Wilderness',
                        south: 'Plains',
                        east: 'Forest',
                        west: 'Hills',
                        northeast: 'Moor'
                    }
                }
            })

            const result = selectFrontierExits(location, 3)
            assert.equal(result.directions.length, 3)
        })

        test('returns all pending exits when count is below cap', () => {
            const location = makeLocation({
                exitAvailability: {
                    pending: {
                        north: 'Wilderness',
                        east: 'Plains'
                    }
                }
            })

            const result = selectFrontierExits(location, 5)
            assert.equal(result.directions.length, 2)
        })

        test('DEFAULT_FRONTIER_CAP is 3', () => {
            assert.equal(DEFAULT_FRONTIER_CAP, 3)
        })

        test('uses DEFAULT_FRONTIER_CAP when cap is omitted', () => {
            const location = makeLocation({
                exitAvailability: {
                    pending: {
                        north: 'A',
                        south: 'B',
                        east: 'C',
                        west: 'D'
                    }
                }
            })

            const result = selectFrontierExits(location)
            assert.equal(result.directions.length, DEFAULT_FRONTIER_CAP)
        })

        test('returns empty array when cap is 0', () => {
            const location = makeLocation({
                exitAvailability: {
                    pending: { north: 'Wilderness' }
                }
            })

            const result = selectFrontierExits(location, 0)
            assert.deepEqual(result.directions, [])
        })
    })

    describe('forbidden exit exclusion', () => {
        test('excludes directions listed in forbidden', () => {
            const location = makeLocation({
                exitAvailability: {
                    pending: {
                        north: 'Wilderness',
                        south: 'Road'
                    },
                    forbidden: {
                        south: 'Cliff face blocks passage'
                    }
                }
            })

            const result = selectFrontierExits(location, 10)
            assert.ok(!result.directions.includes('south'), 'forbidden south should be excluded')
            assert.ok(result.directions.includes('north'), 'pending north should be included')
        })

        test('returns empty when all pending exits are forbidden', () => {
            const location = makeLocation({
                exitAvailability: {
                    pending: {
                        south: 'Ocean',
                        west: 'River'
                    },
                    forbidden: {
                        south: 'Open sea bars passage',
                        west: 'River current — no crossing'
                    }
                }
            })

            const result = selectFrontierExits(location, 10)
            assert.deepEqual(result.directions, [])
        })

        test('frontier+forbidden conflict: forbidden wins with warning', () => {
            const location = makeLocation({
                id: 'conflict-loc',
                tags: [FRONTIER_BOUNDARY_TAG],
                exitAvailability: {
                    pending: {
                        east: 'Coastal path',
                        south: 'Ocean horizon'
                    },
                    forbidden: {
                        south: 'Open sea — impassable'
                    }
                }
            })

            const result = selectFrontierExits(location, 10)
            assert.ok(!result.directions.includes('south'), 'south should be excluded (forbidden wins)')
            assert.ok(result.directions.includes('east'), 'east should be included')
            assert.equal(result.warnings.length, 1)
            assert.ok(result.warnings[0].includes('conflict-loc'))
            assert.ok(result.warnings[0].includes('"south"'))
        })

        test('emits one warning per conflicting direction', () => {
            const location = makeLocation({
                id: 'multi-conflict',
                exitAvailability: {
                    pending: {
                        north: 'A',
                        south: 'B',
                        east: 'C'
                    },
                    forbidden: {
                        north: 'Reason N',
                        south: 'Reason S'
                    }
                }
            })

            const result = selectFrontierExits(location, 10)
            assert.equal(result.warnings.length, 2)
            assert.deepEqual(result.directions, ['east'])
        })
    })

    describe('missing and partial metadata', () => {
        test('returns empty result for location with no exitAvailability', () => {
            const location = makeLocation({})

            const result = selectFrontierExits(location)
            assert.deepEqual(result.directions, [])
            assert.deepEqual(result.warnings, [])
        })

        test('returns empty result when exitAvailability has no pending field', () => {
            const location = makeLocation({
                exitAvailability: {
                    forbidden: { south: 'Wall' }
                }
            })

            const result = selectFrontierExits(location)
            assert.deepEqual(result.directions, [])
        })

        test('handles pending present but forbidden absent', () => {
            const location = makeLocation({
                exitAvailability: {
                    pending: { north: 'Open plain' }
                }
            })

            const result = selectFrontierExits(location)
            assert.deepEqual(result.directions, ['north'])
            assert.equal(result.warnings.length, 0)
        })

        test('isFrontierTagged is false when no tags', () => {
            const location = makeLocation({ exitAvailability: { pending: { north: 'A' } } })
            const result = selectFrontierExits(location)
            assert.equal(result.isFrontierTagged, false)
        })

        test('isFrontierTagged is false when tags list does not include frontier:boundary', () => {
            const location = makeLocation({
                tags: ['settlement:mosswell', 'road'],
                exitAvailability: { pending: { north: 'A' } }
            })
            const result = selectFrontierExits(location)
            assert.equal(result.isFrontierTagged, false)
        })

        test('isFrontierTagged is true when location has frontier:boundary tag', () => {
            const location = makeLocation({
                tags: ['settlement:mosswell', FRONTIER_BOUNDARY_TAG],
                exitAvailability: { pending: { north: 'A' } }
            })
            const result = selectFrontierExits(location)
            assert.equal(result.isFrontierTagged, true)
        })

        test('FRONTIER_BOUNDARY_TAG constant value is "frontier:boundary"', () => {
            assert.equal(FRONTIER_BOUNDARY_TAG, 'frontier:boundary')
        })
    })

    describe('stable ordering', () => {
        test('preserves declaration order of pending exits', () => {
            const location = makeLocation({
                exitAvailability: {
                    pending: {
                        north: 'First',
                        east: 'Second',
                        south: 'Third'
                    }
                }
            })

            const result = selectFrontierExits(location, 10)
            assert.deepEqual(result.directions, ['north', 'east', 'south'])
        })

        test('cap takes the first N in declaration order', () => {
            const location = makeLocation({
                exitAvailability: {
                    pending: {
                        north: 'A',
                        east: 'B',
                        south: 'C',
                        west: 'D'
                    }
                }
            })

            const result = selectFrontierExits(location, 2)
            assert.deepEqual(result.directions, ['north', 'east'])
        })
    })
})
