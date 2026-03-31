import type { Location } from '@piquet-h/shared'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { DEFAULT_FRONTIER_CAP, FRONTIER_BOUNDARY_TAG, selectFrontierExits } from '../../src/seeding/frontierSelectionPolicy.js'

// Mosswell atlas tags used across atlas-scoring tests
const MOSSWELL_NORTHGATE_TAGS = ['frontier:boundary', 'macro:area:lr-area-mosswell-fiordhead', 'macro:route:mw-route-harbor-to-northgate']
const MOSSWELL_DELTA_WATERFRONT_TAGS = [
    'macro:area:lr-area-mosswell-fiordhead',
    'macro:route:mw-route-harbor-to-delta',
    'macro:water:fjord-sound-head'
]

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

    describe('atlas-aware scoring', () => {
        test('Mosswell route-continuity: north ranks first when cap=1 (route trend beats generic direction)', () => {
            // North Gate — north has valley/route-continuity trend AND 'North Road' prefix → highest score
            // northeast and northwest have no atlas trend profile → score=0
            const location = makeLocation({
                tags: MOSSWELL_NORTHGATE_TAGS,
                exitAvailability: {
                    pending: {
                        northeast: 'Into the northern uplands',
                        northwest: 'Toward hill country',
                        north: 'Road continues north'
                    }
                }
            })

            // With cap=1 and atlas scoring, 'north' should win despite being declared last
            const result = selectFrontierExits(location, 1)
            assert.deepEqual(result.directions, ['north'], 'north should be selected for its route-continuity atlas signal')
        })

        test('Mosswell route-continuity: north + west rank above northeast/northwest under cap=2', () => {
            // north has route/valley trend (+170), west has cliff/shelf trend (+35),
            // northeast and northwest have no trend → score=0
            const location = makeLocation({
                tags: MOSSWELL_NORTHGATE_TAGS,
                exitAvailability: {
                    pending: {
                        northeast: 'Into the uplands',
                        northwest: 'Toward hill country',
                        north: 'Road continues north',
                        west: 'Cliff-backed fiord walls'
                    }
                }
            })

            const result = selectFrontierExits(location, 2)
            assert.ok(result.directions.includes('north'), 'north must be in top-2')
            assert.ok(result.directions.includes('west'), 'west must be in top-2')
            assert.ok(!result.directions.includes('northeast'), 'northeast should be excluded under cap=2')
            assert.ok(!result.directions.includes('northwest'), 'northwest should be excluded under cap=2')
        })

        test('waterfront/barrier-constrained: forbidden directions excluded regardless of atlas scoring', () => {
            // River Mouth Dunes style: south and west are forbidden (atlas-constrained availability)
            // east and southeast are pending but both in forbidden too — all excluded
            const location = makeLocation({
                id: 'river-mouth-dunes',
                tags: MOSSWELL_DELTA_WATERFRONT_TAGS,
                exitAvailability: {
                    pending: {
                        east: 'Coastal shelf continues',
                        southeast: 'Delta approach',
                        south: 'Open sea',
                        west: 'Fiord walls'
                    },
                    forbidden: {
                        south: { reason: 'Open sea bars passage', motif: 'sea', reveal: 'onTryMove' },
                        west: { reason: 'Fiord walls block passage', motif: 'cliff', reveal: 'onTryMove' }
                    }
                }
            })

            const result = selectFrontierExits(location, 10)
            assert.ok(!result.directions.includes('south'), 'south must be excluded (forbidden)')
            assert.ok(!result.directions.includes('west'), 'west must be excluded (forbidden)')
            assert.ok(result.directions.includes('east'), 'east should be present')
            assert.ok(result.directions.includes('southeast'), 'southeast should be present')
            assert.equal(result.warnings.length, 2, 'one warning per pending+forbidden conflict')
        })

        test('atlasScores is present when location has atlas tags', () => {
            const location = makeLocation({
                tags: MOSSWELL_NORTHGATE_TAGS,
                exitAvailability: {
                    pending: {
                        north: 'Road continues',
                        east: 'Hills ahead'
                    }
                }
            })

            const result = selectFrontierExits(location, 10)
            assert.ok(result.atlasScores !== undefined, 'atlasScores should be present with atlas tags')
            assert.ok('north' in result.atlasScores!, 'north should have a score')
            assert.ok('east' in result.atlasScores!, 'east should have a score')
            assert.ok(result.atlasScores!.north! > result.atlasScores!.east!, 'north should outrank east')
        })

        test('atlasScores is absent when location has no atlas tags', () => {
            const location = makeLocation({
                tags: ['frontier:boundary'],
                exitAvailability: {
                    pending: {
                        north: 'Open plains',
                        east: 'Forest'
                    }
                }
            })

            const result = selectFrontierExits(location, 10)
            assert.equal(result.atlasScores, undefined, 'atlasScores should be absent without atlas tags')
        })

        test('stable tie-breaking: declaration order preserved when atlas scores are equal', () => {
            // northeast and northwest have no atlas trend profile → both score=0
            // declaration order (northeast before northwest) must be preserved
            const location = makeLocation({
                tags: MOSSWELL_NORTHGATE_TAGS,
                exitAvailability: {
                    pending: {
                        northeast: 'Uplands',
                        northwest: 'Hill country'
                    }
                }
            })

            const result = selectFrontierExits(location, 10)
            assert.deepEqual(result.directions, ['northeast', 'northwest'], 'declaration order preserved for equal scores')
        })

        test('no atlas tags → falls back to declaration order (backward compatible)', () => {
            const location = makeLocation({
                // no tags at all
                exitAvailability: {
                    pending: {
                        east: 'First declared',
                        north: 'Second declared',
                        west: 'Third declared'
                    }
                }
            })

            const result = selectFrontierExits(location, 10)
            assert.deepEqual(result.directions, ['east', 'north', 'west'], 'declaration order preserved without atlas tags')
            assert.equal(result.atlasScores, undefined, 'no atlasScores without atlas tags')
        })
    })
})
