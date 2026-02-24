/**
 * Integration tests for TemporalProximityService
 *
 * Covers:
 *  - Loop closure (strict urban reconnection via exit chain)
 *  - Fuzzy wilderness proximity (threshold filtering with deterministic ordering)
 *  - Missing travelDurationMs fallback to default
 *  - Dangling exit targets (skip during traversal)
 *  - Cross-realm leakage guard (realmKey filter)
 *  - checkDirectReconnection (direction + destination existence)
 */

import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { describeForBothModes } from '../helpers/describeForBothModes.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describeForBothModes('TemporalProximityService', (mode) => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture(mode)
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    // -------------------------------------------------------------------------
    // Helper: seed a location and its exits via the repository
    // -------------------------------------------------------------------------
    async function seedLocations(locations: { id: string; name: string; tags?: string[] }[]) {
        const locationRepo = await fixture.getLocationRepository()
        for (const loc of locations) {
            await locationRepo.upsert({ id: loc.id, name: loc.name, description: '', tags: loc.tags })
        }
        return locationRepo
    }

    // -------------------------------------------------------------------------
    // Loop closure — strict urban reconnection
    // -------------------------------------------------------------------------
    describe('findWithinTravelTime: loop closure', () => {
        test('returns all reachable locations in the loop, ordered by accumulated travel time', async () => {
            const locationRepo = await seedLocations([
                { id: 'tp-a', name: 'A' },
                { id: 'tp-b', name: 'B' },
                { id: 'tp-c', name: 'C' },
                { id: 'tp-d', name: 'D' }
            ])

            // A → B (north, 60 s) → C (east, 60 s) → D (south, 60 s) → A (west, 60 s)
            await locationRepo.ensureExit('tp-a', 'north', 'tp-b')
            await locationRepo.ensureExit('tp-b', 'east', 'tp-c')
            await locationRepo.ensureExit('tp-c', 'south', 'tp-d')
            await locationRepo.ensureExit('tp-d', 'west', 'tp-a')

            // Set travel durations (60 s per hop)
            await locationRepo.setExitTravelDuration('tp-a', 'north', 60_000)
            await locationRepo.setExitTravelDuration('tp-b', 'east', 60_000)
            await locationRepo.setExitTravelDuration('tp-c', 'south', 60_000)
            await locationRepo.setExitTravelDuration('tp-d', 'west', 60_000)

            const service = await fixture.getTemporalProximityService()
            // Budget covers the entire loop (3 hops × 60 s = 180 s, source excluded)
            const candidates = await service.findWithinTravelTime('tp-a', 300_000)

            const ids = candidates.map((c) => c.locationId)
            assert.deepStrictEqual(ids, ['tp-b', 'tp-c', 'tp-d'], 'should include all three reachable locations')

            // Verify accumulated costs
            assert.strictEqual(candidates[0].accumulatedTravelMs, 60_000, 'B is 60 s from A')
            assert.strictEqual(candidates[1].accumulatedTravelMs, 120_000, 'C is 120 s from A')
            assert.strictEqual(candidates[2].accumulatedTravelMs, 180_000, 'D is 180 s from A')

            // Hops
            assert.strictEqual(candidates[0].hops, 1)
            assert.strictEqual(candidates[1].hops, 2)
            assert.strictEqual(candidates[2].hops, 3)
        })

        test('excludes the source location itself from results', async () => {
            const locationRepo = await seedLocations([
                { id: 'tp-src', name: 'Source' },
                { id: 'tp-nbr', name: 'Neighbour' }
            ])
            await locationRepo.ensureExit('tp-src', 'east', 'tp-nbr')
            await locationRepo.setExitTravelDuration('tp-src', 'east', 60_000)
            await locationRepo.ensureExit('tp-nbr', 'west', 'tp-src')
            await locationRepo.setExitTravelDuration('tp-nbr', 'west', 60_000)

            const service = await fixture.getTemporalProximityService()
            const candidates = await service.findWithinTravelTime('tp-src', 300_000)

            assert.ok(!candidates.some((c) => c.locationId === 'tp-src'), 'source should not appear in results')
        })

        test('returns empty array when no exits exist', async () => {
            await seedLocations([{ id: 'tp-isolated', name: 'Isolated' }])

            const service = await fixture.getTemporalProximityService()
            const candidates = await service.findWithinTravelTime('tp-isolated', 300_000)

            assert.deepStrictEqual(candidates, [])
        })
    })

    // -------------------------------------------------------------------------
    // Fuzzy wilderness proximity — threshold + deterministic ordering
    // -------------------------------------------------------------------------
    describe('findWithinTravelTime: fuzzy wilderness proximity', () => {
        test('only returns locations within the travel-time budget', async () => {
            const locationRepo = await seedLocations([
                { id: 'tp-center', name: 'Center' },
                { id: 'tp-near', name: 'Near' },
                { id: 'tp-far', name: 'Far' }
            ])

            await locationRepo.ensureExit('tp-center', 'north', 'tp-near')
            await locationRepo.setExitTravelDuration('tp-center', 'north', 300_000) // 5 min

            await locationRepo.ensureExit('tp-center', 'south', 'tp-far')
            await locationRepo.setExitTravelDuration('tp-center', 'south', 3_600_000) // 1 hour

            const service = await fixture.getTemporalProximityService()
            // Budget: 600 s — includes Near (300 s) but not Far (3600 s)
            const candidates = await service.findWithinTravelTime('tp-center', 600_000)

            assert.strictEqual(candidates.length, 1, 'only Near should be within budget')
            assert.strictEqual(candidates[0].locationId, 'tp-near')
            assert.strictEqual(candidates[0].accumulatedTravelMs, 300_000)
        })

        test('ties broken lexicographically by locationId', async () => {
            const locationRepo = await seedLocations([
                { id: 'tp-hub', name: 'Hub' },
                { id: 'tp-z-loc', name: 'Z loc' },
                { id: 'tp-a-loc', name: 'A loc' }
            ])

            // Both equidistant (same travel time)
            await locationRepo.ensureExit('tp-hub', 'north', 'tp-z-loc')
            await locationRepo.setExitTravelDuration('tp-hub', 'north', 120_000)

            await locationRepo.ensureExit('tp-hub', 'south', 'tp-a-loc')
            await locationRepo.setExitTravelDuration('tp-hub', 'south', 120_000)

            const service = await fixture.getTemporalProximityService()
            const candidates = await service.findWithinTravelTime('tp-hub', 300_000)

            assert.strictEqual(candidates.length, 2)
            assert.strictEqual(candidates[0].accumulatedTravelMs, 120_000)
            assert.strictEqual(candidates[1].accumulatedTravelMs, 120_000)
            // Lexicographic: 'tp-a-loc' < 'tp-z-loc'
            assert.strictEqual(candidates[0].locationId, 'tp-a-loc')
            assert.strictEqual(candidates[1].locationId, 'tp-z-loc')
        })

        test('uses default 60 s fallback when exit has no travelDurationMs', async () => {
            const locationRepo = await seedLocations([
                { id: 'tp-def-src', name: 'DefSrc' },
                { id: 'tp-def-dst', name: 'DefDst' }
            ])

            // No setExitTravelDuration call → travelDurationMs absent
            await locationRepo.ensureExit('tp-def-src', 'east', 'tp-def-dst')

            const service = await fixture.getTemporalProximityService()
            // Budget exactly equals the 60 s default fallback
            const candidates = await service.findWithinTravelTime('tp-def-src', 60_000)

            assert.strictEqual(candidates.length, 1)
            assert.strictEqual(candidates[0].locationId, 'tp-def-dst')
            assert.strictEqual(candidates[0].accumulatedTravelMs, 60_000)
        })

        test('skips dangling exits (destination not in repository)', async () => {
            const locationRepo = await seedLocations([{ id: 'tp-dangle-src', name: 'DangleSrc' }])

            // Create exit pointing to a non-existent location
            await locationRepo.upsert({
                id: 'tp-dangle-src',
                name: 'DangleSrc',
                description: '',
                exits: [{ direction: 'north', to: 'tp-does-not-exist' }]
            })

            const service = await fixture.getTemporalProximityService()
            const candidates = await service.findWithinTravelTime('tp-dangle-src', 300_000)

            assert.deepStrictEqual(candidates, [], 'dangling exit target should be silently skipped')
        })
    })

    // -------------------------------------------------------------------------
    // Realm key filter — cross-realm leakage guard
    // -------------------------------------------------------------------------
    describe('findWithinTravelTime: realm key filter', () => {
        test('only returns locations whose tags include the realmKey', async () => {
            const locationRepo = await seedLocations([
                { id: 'tp-realm-src', name: 'RealmSrc', tags: ['settlement:mosswell'] },
                { id: 'tp-realm-in', name: 'RealmIn', tags: ['settlement:mosswell'] },
                { id: 'tp-realm-out', name: 'RealmOut', tags: ['biome:forest'] }
            ])

            await locationRepo.ensureExit('tp-realm-src', 'north', 'tp-realm-in')
            await locationRepo.setExitTravelDuration('tp-realm-src', 'north', 60_000)

            await locationRepo.ensureExit('tp-realm-src', 'south', 'tp-realm-out')
            await locationRepo.setExitTravelDuration('tp-realm-src', 'south', 60_000)

            const service = await fixture.getTemporalProximityService()
            const candidates = await service.findWithinTravelTime('tp-realm-src', 120_000, 'settlement:mosswell')

            assert.strictEqual(candidates.length, 1, 'only the settlement location should pass the realm filter')
            assert.strictEqual(candidates[0].locationId, 'tp-realm-in')
        })

        test('returns all reachable locations when no realmKey provided', async () => {
            const locationRepo = await seedLocations([
                { id: 'tp-all-src', name: 'AllSrc', tags: ['settlement:mosswell'] },
                { id: 'tp-all-a', name: 'AllA', tags: ['settlement:mosswell'] },
                { id: 'tp-all-b', name: 'AllB', tags: ['biome:forest'] }
            ])

            await locationRepo.ensureExit('tp-all-src', 'north', 'tp-all-a')
            await locationRepo.setExitTravelDuration('tp-all-src', 'north', 60_000)

            await locationRepo.ensureExit('tp-all-src', 'south', 'tp-all-b')
            await locationRepo.setExitTravelDuration('tp-all-src', 'south', 60_000)

            const service = await fixture.getTemporalProximityService()
            const candidates = await service.findWithinTravelTime('tp-all-src', 120_000)

            assert.strictEqual(candidates.length, 2, 'both locations should be returned without realm filter')
        })
    })

    // -------------------------------------------------------------------------
    // checkDirectReconnection
    // -------------------------------------------------------------------------
    describe('checkDirectReconnection', () => {
        test('returns found=true with locationId when exit leads to an existing location', async () => {
            const locationRepo = await seedLocations([
                { id: 'tp-cr-src', name: 'CRSrc' },
                { id: 'tp-cr-dst', name: 'CRDst' }
            ])
            await locationRepo.ensureExit('tp-cr-src', 'north', 'tp-cr-dst')

            const service = await fixture.getTemporalProximityService()
            // travelMs is informational (not validated by the implementation yet);
            // pass the expected exit duration for documentation purposes.
            const result = await service.checkDirectReconnection('tp-cr-src', 'north', 60_000)

            assert.strictEqual(result.found, true)
            assert.strictEqual(result.locationId, 'tp-cr-dst')
        })

        test('returns found=false when no exit exists in that direction', async () => {
            await seedLocations([{ id: 'tp-cr-noex', name: 'NoExit' }])

            const service = await fixture.getTemporalProximityService()
            // travelMs is informational (not validated by the implementation yet).
            const result = await service.checkDirectReconnection('tp-cr-noex', 'north', 60_000)

            assert.strictEqual(result.found, false)
            assert.strictEqual(result.locationId, undefined)
        })

        test('returns found=false when exit target is dangling', async () => {
            const locationRepo = await seedLocations([{ id: 'tp-cr-dangle', name: 'DangleSrc' }])

            // Manually wire a dangling exit
            await locationRepo.upsert({
                id: 'tp-cr-dangle',
                name: 'DangleSrc',
                description: '',
                exits: [{ direction: 'east', to: 'tp-ghost-location' }]
            })

            const service = await fixture.getTemporalProximityService()
            const result = await service.checkDirectReconnection('tp-cr-dangle', 'east', 60_000)

            assert.strictEqual(result.found, false)
        })
    })

    // -------------------------------------------------------------------------
    // Dijkstra correctness — prefer shorter accumulated path over fewer hops
    // -------------------------------------------------------------------------
    describe('findWithinTravelTime: Dijkstra shortest-path correctness', () => {
        test('reaches a location via the shorter accumulated path when two routes exist', async () => {
            // A --60s--> B --60s--> C  (120 s total via B)
            // A --200s-> C           (200 s total direct)
            // Dijkstra should record C at 120 s, not 200 s
            const locationRepo = await seedLocations([
                { id: 'tp-dijk-a', name: 'A' },
                { id: 'tp-dijk-b', name: 'B' },
                { id: 'tp-dijk-c', name: 'C' }
            ])

            await locationRepo.ensureExit('tp-dijk-a', 'north', 'tp-dijk-b')
            await locationRepo.setExitTravelDuration('tp-dijk-a', 'north', 60_000)

            await locationRepo.ensureExit('tp-dijk-b', 'east', 'tp-dijk-c')
            await locationRepo.setExitTravelDuration('tp-dijk-b', 'east', 60_000)

            await locationRepo.ensureExit('tp-dijk-a', 'east', 'tp-dijk-c')
            await locationRepo.setExitTravelDuration('tp-dijk-a', 'east', 200_000)

            const service = await fixture.getTemporalProximityService()
            const candidates = await service.findWithinTravelTime('tp-dijk-a', 300_000)

            const c = candidates.find((x) => x.locationId === 'tp-dijk-c')
            assert.ok(c, 'C should be reachable')
            assert.strictEqual(c.accumulatedTravelMs, 120_000, 'should use the shorter path (via B)')
        })
    })
})
