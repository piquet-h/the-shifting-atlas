import { Direction, STARTER_LOCATION_ID } from '@piquet-h/shared'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { ExitEdgeResult, generateExitsSummaryCache } from '../../src/repos/exitRepository.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describe('LOOK Command Flow', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('generateExitsSummaryCache', () => {
        test('with multiple exits', () => {
            const exits: ExitEdgeResult[] = [
                { direction: 'north', toLocationId: 'loc1' },
                { direction: 'south', toLocationId: 'loc2' },
                { direction: 'east', toLocationId: 'loc3' }
            ]
            const summary = generateExitsSummaryCache(exits)
            assert.equal(summary, 'Exits: north, south, east')
        })

        test('with single exit', () => {
            const exits: ExitEdgeResult[] = [{ direction: 'north', toLocationId: 'loc1' }]
            const summary = generateExitsSummaryCache(exits)
            assert.equal(summary, 'Exits: north')
        })

        test('with no exits', () => {
            const exits: ExitEdgeResult[] = []
            const summary = generateExitsSummaryCache(exits)
            assert.equal(summary, 'No exits available.')
        })

        test('exits ordered canonically', () => {
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

        test('ignores exit descriptions (direction-only cache)', () => {
            const exits: ExitEdgeResult[] = [
                { direction: 'north', toLocationId: 'loc1', description: 'through the archway' },
                { direction: 'east', toLocationId: 'loc2', description: 'past the market stalls' }
            ]
            const summary = generateExitsSummaryCache(exits)
            assert.equal(summary, 'Exits: north, east')
            assert.doesNotMatch(summary, /\(/, 'Summary should not include parenthesized descriptions')
        })
    })

    describe('Location repository - updateExitsSummaryCache', () => {
        test('updates cache successfully', async () => {
            const repo = await fixture.getLocationRepository()

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

        test('on missing location', async () => {
            const repo = await fixture.getLocationRepository()

            const result = await repo.updateExitsSummaryCache('nonexistent-id', 'Exits: north')
            assert.equal(result.updated, false, 'Should not update non-existent location')
        })
    })

    describe('Location repository - regenerateExitsSummaryCache', () => {
        test('generates direction-only cache (ignores descriptions)', async () => {
            const repo = await fixture.getLocationRepository()

            const fromId = STARTER_LOCATION_ID
            const toId = '11111111-1111-1111-1111-111111111111'

            await repo.upsert({
                id: toId,
                name: 'Dest',
                description: 'Destination',
                exits: []
            })

            // Ensure an exit that includes a description
            await repo.ensureExit(fromId, 'north', toId, 'through a mossy archway')

            // Regenerate cache and verify it does not include descriptions/parentheses
            await repo.regenerateExitsSummaryCache(fromId)
            const updated = await repo.get(fromId)
            assert.ok(updated, 'Location should exist')
            assert.ok(updated.exitsSummaryCache, 'Cache should exist after regeneration')
            assert.doesNotMatch(updated.exitsSummaryCache, /\(/, 'Cache should not include parenthesized descriptions')
            assert.ok(!updated.exitsSummaryCache.includes('through a mossy archway'), 'Cache should not include free-text exit description')
        })
    })

    describe('LOOK command flow scenarios', () => {
        test('cache hit path', async () => {
            const repo = await fixture.getLocationRepository()

            // Pre-populate cache
            await repo.updateExitsSummaryCache(STARTER_LOCATION_ID, 'Exits: north, east')

            const location = await repo.get(STARTER_LOCATION_ID)
            assert.ok(location, 'Location should exist')
            assert.equal(location.exitsSummaryCache, 'Exits: north, east', 'Cache should be present')
        })

        test('cache miss and regeneration', async () => {
            const repo = await fixture.getLocationRepository()

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

        test('repeated LOOK returns cache', async () => {
            const repo = await fixture.getLocationRepository()

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
    })
})
