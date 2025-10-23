import { Direction, STARTER_LOCATION_ID } from '@piquet-h/shared'
import assert from 'node:assert'
import { test } from 'node:test'
import { ExitEdgeResult, generateExitsSummaryCache } from '../src/repos/exitRepository.js'
import { __resetLocationRepositoryForTests, getLocationRepository } from '../src/repos/locationRepository.js'

test('generateExitsSummaryCache - with multiple exits', () => {
    const exits: ExitEdgeResult[] = [
        { direction: 'north', toLocationId: 'loc1' },
        { direction: 'south', toLocationId: 'loc2' },
        { direction: 'east', toLocationId: 'loc3' }
    ]
    const summary = generateExitsSummaryCache(exits)
    assert.equal(summary, 'Exits: north, south, east')
})

test('generateExitsSummaryCache - with single exit', () => {
    const exits: ExitEdgeResult[] = [{ direction: 'north', toLocationId: 'loc1' }]
    const summary = generateExitsSummaryCache(exits)
    assert.equal(summary, 'Exits: north')
})

test('generateExitsSummaryCache - with no exits', () => {
    const exits: ExitEdgeResult[] = []
    const summary = generateExitsSummaryCache(exits)
    assert.equal(summary, 'No exits available.')
})

test('generateExitsSummaryCache - exits ordered canonically', () => {
    const exits: ExitEdgeResult[] = [
        { direction: 'up', toLocationId: 'loc4' },
        { direction: 'east', toLocationId: 'loc3' },
        { direction: 'north', toLocationId: 'loc1' },
        { direction: 'south', toLocationId: 'loc2' }
    ]
    const summary = generateExitsSummaryCache(exits)
    // Should be ordered: north, south, east, up
    assert.equal(summary, 'Exits: north, south, east, up')
})

test('Location repository - updateExitsSummaryCache', async () => {
    __resetLocationRepositoryForTests()
    const repo = await getLocationRepository()

    // Get a location
    const location = await repo.get(STARTER_LOCATION_ID)
    assert.ok(location, 'Location should exist')

    // Update cache
    const testCache = 'Exits: north, south'
    const result = await repo.updateExitsSummaryCache(STARTER_LOCATION_ID, testCache)
    assert.equal(result.updated, true, 'Cache should be updated')

    // Verify cache was stored
    const updated = await repo.get(STARTER_LOCATION_ID)
    assert.equal(updated?.exitsSummaryCache, testCache, 'Cache should match')
})

test('Location repository - updateExitsSummaryCache on missing location', async () => {
    __resetLocationRepositoryForTests()
    const repo = await getLocationRepository()

    const result = await repo.updateExitsSummaryCache('nonexistent-id', 'Exits: north')
    assert.equal(result.updated, false, 'Should not update non-existent location')
})

test('LOOK command flow - cache hit path', async () => {
    __resetLocationRepositoryForTests()
    const repo = await getLocationRepository()

    // Pre-populate cache
    await repo.updateExitsSummaryCache(STARTER_LOCATION_ID, 'Exits: north, east')

    const location = await repo.get(STARTER_LOCATION_ID)
    assert.ok(location, 'Location should exist')
    assert.equal(location.exitsSummaryCache, 'Exits: north, east', 'Cache should be present')
})

test('LOOK command flow - cache miss and regeneration', async () => {
    __resetLocationRepositoryForTests()
    const repo = await getLocationRepository()

    // Get location
    const location = await repo.get(STARTER_LOCATION_ID)
    assert.ok(location, 'Location should exist')

    // Clear any existing cache to simulate cache miss
    if (location.exitsSummaryCache) {
        await repo.updateExitsSummaryCache(STARTER_LOCATION_ID, '')
    }

    // Get fresh copy without cache
    const locationWithoutCache = await repo.get(STARTER_LOCATION_ID)

    // Generate cache from exits
    const exitEdges: ExitEdgeResult[] = (locationWithoutCache?.exits || []).map((e) => ({
        direction: e.direction as Direction,
        toLocationId: e.to || '',
        description: e.description
    }))
    const generatedCache = generateExitsSummaryCache(exitEdges)

    // Persist cache
    await repo.updateExitsSummaryCache(STARTER_LOCATION_ID, generatedCache)

    // Verify cache was stored
    const updated = await repo.get(STARTER_LOCATION_ID)
    assert.ok(updated?.exitsSummaryCache, 'Cache should exist after generation')
    assert.equal(updated?.exitsSummaryCache, generatedCache, 'Cache should match generated value')
})

test('LOOK command flow - repeated LOOK returns cache', async () => {
    __resetLocationRepositoryForTests()
    const repo = await getLocationRepository()

    // First LOOK - generate cache
    const location1 = await repo.get(STARTER_LOCATION_ID)
    assert.ok(location1, 'Location should exist')

    const exitEdges: ExitEdgeResult[] = (location1.exits || []).map((e) => ({
        direction: e.direction as Direction,
        toLocationId: e.to || '',
        description: e.description
    }))
    const generatedCache = generateExitsSummaryCache(exitEdges)
    await repo.updateExitsSummaryCache(STARTER_LOCATION_ID, generatedCache)

    // Second LOOK - should return cached value
    const location2 = await repo.get(STARTER_LOCATION_ID)
    assert.equal(location2?.exitsSummaryCache, generatedCache, 'Cache should be returned on repeat LOOK')
})
