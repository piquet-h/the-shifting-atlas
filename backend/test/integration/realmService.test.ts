/**
 * Integration tests for Realm Service
 * Tests full realm hierarchy traversal and location context assembly
 */

import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import type { RealmService } from '../../src/services/RealmService.js'
import type { IRealmRepository } from '../../src/repos/realmRepository.js'
import type { ILocationRepository } from '../../src/repos/locationRepository.js'
import type { ILayerRepository } from '../../src/repos/layerRepository.js'
import type { RealmVertex, Location } from '@piquet-h/shared'

describe('Realm Service (Integration)', () => {
    let fixture: IntegrationTestFixture
    let realmService: RealmService
    let realmRepo: IRealmRepository
    let locationRepo: ILocationRepository
    let layerRepo: ILayerRepository

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
        realmService = await fixture.getRealmService()
        realmRepo = await fixture.getRealmRepository()
        locationRepo = await fixture.getLocationRepository()
        layerRepo = await fixture.getLayerRepository()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('Multi-tier Hierarchy Integration', () => {
        test('should assemble full location context for location → district → city → kingdom → continent', async () => {
            // Create realm hierarchy
            const continent: RealmVertex = {
                id: crypto.randomUUID(),
                name: 'Faerûn',
                realmType: 'CONTINENT',
                scope: 'CONTINENTAL',
                narrativeTags: ['ancient', 'magical']
            }

            const kingdom: RealmVertex = {
                id: crypto.randomUUID(),
                name: 'Kingdom of Shadows',
                realmType: 'KINGDOM',
                scope: 'MACRO',
                narrativeTags: ['mysterious', 'powerful']
            }

            const city: RealmVertex = {
                id: crypto.randomUUID(),
                name: 'Waterdeep',
                realmType: 'CITY',
                scope: 'REGIONAL',
                narrativeTags: ['coastal', 'bustling']
            }

            const district: RealmVertex = {
                id: crypto.randomUUID(),
                name: 'Market District',
                realmType: 'DISTRICT',
                scope: 'LOCAL',
                narrativeTags: ['commercial', 'bustling'] // duplicate 'bustling' to test deduplication
            }

            const weatherZone: RealmVertex = {
                id: crypto.randomUUID(),
                name: 'Temperate Coast',
                realmType: 'WEATHER_ZONE',
                scope: 'MACRO',
                narrativeTags: ['mild']
            }

            // Create realms
            await realmRepo.upsert(continent)
            await realmRepo.upsert(kingdom)
            await realmRepo.upsert(city)
            await realmRepo.upsert(district)
            await realmRepo.upsert(weatherZone)

            // Create location
            const location: Location = {
                id: crypto.randomUUID(),
                name: 'Town Square',
                description: 'A bustling town square in the heart of the market district.',
                exits: [
                    { direction: 'north', to: crypto.randomUUID() },
                    { direction: 'south', to: crypto.randomUUID() }
                ]
            }

            const adjacentLocation1: Location = {
                id: location.exits![0].to!,
                name: 'North Market',
                description: 'The northern section of the market.',
                exits: []
            }

            const adjacentLocation2: Location = {
                id: location.exits![1].to!,
                name: 'South Plaza',
                description: 'An open plaza to the south.',
                exits: []
            }

            await locationRepo.upsert(location)
            await locationRepo.upsert(adjacentLocation1)
            await locationRepo.upsert(adjacentLocation2)

            // Build containment hierarchy: location → district → city → kingdom → continent
            await realmRepo.addWithinEdge(location.id, district.id)
            await realmRepo.addWithinEdge(district.id, city.id)
            await realmRepo.addWithinEdge(city.id, kingdom.id)
            await realmRepo.addWithinEdge(kingdom.id, continent.id)

            // Add weather zone containment
            await realmRepo.addWithinEdge(location.id, weatherZone.id)

            // Set some description layers
            await layerRepo.setLayerForLocation(location.id, 'ambient', 100, 500, 'Market vendors call out their wares.')
            await layerRepo.setLayerForRealm(weatherZone.id, 'weather', 100, 1000, 'A gentle breeze carries the scent of the sea.')

            // Get location context
            const context = await realmService.getLocationContext(location.id, 300)

            // Verify location
            assert.strictEqual(context.location.id, location.id)
            assert.strictEqual(context.location.name, 'Town Square')

            // Verify geographic realms (CONTINENT)
            assert.strictEqual(context.geographic.length, 1)
            assert.strictEqual(context.geographic[0].name, 'Faerûn')

            // Verify political realms (KINGDOM, CITY, DISTRICT)
            assert.strictEqual(context.political.length, 3)
            const politicalNames = context.political.map((r) => r.name).sort()
            assert.deepStrictEqual(politicalNames, ['Kingdom of Shadows', 'Market District', 'Waterdeep'])

            // Verify weather realms (WEATHER_ZONE)
            assert.strictEqual(context.weather.length, 1)
            assert.strictEqual(context.weather[0].name, 'Temperate Coast')

            // Verify functional realms (none in this test)
            assert.strictEqual(context.functional.length, 0)

            // Verify adjacent locations
            assert.strictEqual(context.nearby.length, 2)
            const nearbyNames = context.nearby.map((l) => l.name).sort()
            assert.deepStrictEqual(nearbyNames, ['North Market', 'South Plaza'])

            // Verify narrative tags (deduplicated and sorted)
            assert.strictEqual(context.narrativeTags.length, 8)
            assert.deepStrictEqual(
                context.narrativeTags,
                ['ancient', 'bustling', 'coastal', 'commercial', 'magical', 'mild', 'mysterious', 'powerful'].sort()
            )

            // Verify layers
            assert.strictEqual(context.layers.length, 2) // ambient + weather
            const layerTypes = context.layers.map((l) => l.layerType).sort()
            assert.deepStrictEqual(layerTypes, ['ambient', 'weather'])
        })

        test('should filter realms by type', async () => {
            // Create mixed hierarchy
            const continent: RealmVertex = {
                id: crypto.randomUUID(),
                name: 'Continent A',
                realmType: 'CONTINENT',
                scope: 'CONTINENTAL'
            }

            const kingdom: RealmVertex = {
                id: crypto.randomUUID(),
                name: 'Kingdom B',
                realmType: 'KINGDOM',
                scope: 'MACRO'
            }

            const city: RealmVertex = {
                id: crypto.randomUUID(),
                name: 'City C',
                realmType: 'CITY',
                scope: 'REGIONAL'
            }

            await realmRepo.upsert(continent)
            await realmRepo.upsert(kingdom)
            await realmRepo.upsert(city)

            const locationId = crypto.randomUUID()
            await realmRepo.addWithinEdge(locationId, city.id)
            await realmRepo.addWithinEdge(city.id, kingdom.id)
            await realmRepo.addWithinEdge(kingdom.id, continent.id)

            // Filter to only political realms
            const politicalOnly = await realmService.getContainingRealms(locationId, ['CITY', 'KINGDOM'])

            assert.strictEqual(politicalOnly.length, 2)
            const names = politicalOnly.map((r) => r.name).sort()
            assert.deepStrictEqual(names, ['City C', 'Kingdom B'])
        })

        test('should handle location with no adjacent exits', async () => {
            const district: RealmVertex = {
                id: crypto.randomUUID(),
                name: 'Isolated District',
                realmType: 'DISTRICT',
                scope: 'LOCAL'
            }

            await realmRepo.upsert(district)

            const location: Location = {
                id: crypto.randomUUID(),
                name: 'Dead End',
                description: 'A location with no exits.',
                exits: []
            }

            await locationRepo.upsert(location)
            await realmRepo.addWithinEdge(location.id, district.id)

            const context = await realmService.getLocationContext(location.id, 100)

            assert.strictEqual(context.nearby.length, 0)
            assert.strictEqual(context.political.length, 1)
        })

        test('should handle location with exits to non-existent locations', async () => {
            const location: Location = {
                id: crypto.randomUUID(),
                name: 'Broken Exit Location',
                description: 'Has exits to locations that do not exist.',
                exits: [
                    { direction: 'north', to: 'nonexistent-id-1' },
                    { direction: 'south', to: 'nonexistent-id-2' }
                ]
            }

            await locationRepo.upsert(location)

            const context = await realmService.getLocationContext(location.id, 100)

            // Should not crash, just return empty nearby array
            assert.strictEqual(context.nearby.length, 0)
        })

        test('should handle layers outside temporal range', async () => {
            const location: Location = {
                id: crypto.randomUUID(),
                name: 'Test Location',
                description: 'A test location.',
                exits: []
            }

            await locationRepo.upsert(location)

            // Layer active from tick 1000 to 2000
            await layerRepo.setLayerForLocation(location.id, 'ambient', 1000, 2000, 'Time-limited layer.')

            // Query before layer is active
            const contextBefore = await realmService.getLocationContext(location.id, 500)
            assert.strictEqual(contextBefore.layers.length, 0)

            // Query within layer active range
            const contextDuring = await realmService.getLocationContext(location.id, 1500)
            assert.strictEqual(contextDuring.layers.length, 1)
            assert.strictEqual(contextDuring.layers[0].value, 'Time-limited layer.')

            // Query after layer expires
            const contextAfter = await realmService.getLocationContext(location.id, 3000)
            assert.strictEqual(contextAfter.layers.length, 0)
        })
    })
})
