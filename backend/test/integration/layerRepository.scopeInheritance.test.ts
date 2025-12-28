/**
 * Integration tests for Layer Repository Scope Inheritance
 * Tests realm-based layer resolution with location-specific overrides
 */

import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import type { ILayerRepository } from '../../src/repos/layerRepository.js'
import type { IRealmRepository } from '../../src/repos/realmRepository.js'
import { RealmVertex } from '@piquet-h/shared'

describe('Layer Repository Scope Inheritance (Integration)', () => {
    let fixture: IntegrationTestFixture
    let layerRepo: ILayerRepository
    let realmRepo: IRealmRepository

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
        layerRepo = await fixture.getLayerRepository()
        realmRepo = await fixture.getRealmRepository()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('Realm Layer Inheritance', () => {
        test('should inherit realm layer when no location-specific layer exists', async () => {
            // Create a weather zone realm
            const weatherZone: RealmVertex = {
                id: crypto.randomUUID(),
                name: 'Storm Coast',
                realmType: 'WEATHER_ZONE',
                scope: 'REGIONAL'
            }
            await realmRepo.upsert(weatherZone)

            // Create a location within the weather zone
            const locationId = crypto.randomUUID()
            await realmRepo.addWithinEdge(locationId, weatherZone.id)

            // Set a weather layer for the realm
            await layerRepo.setLayerForRealm(weatherZone.id, 'weather', 1000, 2000, 'Heavy rain falls from dark clouds.')

            // Query the layer for the location - should inherit from realm
            const activeLayer = await layerRepo.getActiveLayerForLocation(locationId, 'weather', 1500)

            assert.ok(activeLayer, 'Should find active layer')
            assert.strictEqual(activeLayer.scopeId, `realm:${weatherZone.id}`)
            assert.strictEqual(activeLayer.layerType, 'weather')
            assert.strictEqual(activeLayer.value, 'Heavy rain falls from dark clouds.')
        })

        test('should return null when no realm or location layer exists', async () => {
            const locationId = crypto.randomUUID()

            const activeLayer = await layerRepo.getActiveLayerForLocation(locationId, 'weather', 1000)

            assert.strictEqual(activeLayer, null)
        })

        test('should return null when layer is outside temporal range', async () => {
            const weatherZone: RealmVertex = {
                id: crypto.randomUUID(),
                name: 'Misty Valley',
                realmType: 'WEATHER_ZONE',
                scope: 'REGIONAL'
            }
            await realmRepo.upsert(weatherZone)

            const locationId = crypto.randomUUID()
            await realmRepo.addWithinEdge(locationId, weatherZone.id)

            // Layer active from tick 1000 to 2000
            await layerRepo.setLayerForRealm(weatherZone.id, 'weather', 1000, 2000, 'Fog blankets the valley.')

            // Query before range
            const beforeLayer = await layerRepo.getActiveLayerForLocation(locationId, 'weather', 500)
            assert.strictEqual(beforeLayer, null)

            // Query after range
            const afterLayer = await layerRepo.getActiveLayerForLocation(locationId, 'weather', 3000)
            assert.strictEqual(afterLayer, null)

            // Query within range - should find it
            const withinLayer = await layerRepo.getActiveLayerForLocation(locationId, 'weather', 1500)
            assert.ok(withinLayer)
        })

        test('should support indefinite realm layers (toTick: null)', async () => {
            const weatherZone: RealmVertex = {
                id: crypto.randomUUID(),
                name: 'Eternal Frost',
                realmType: 'WEATHER_ZONE',
                scope: 'REGIONAL'
            }
            await realmRepo.upsert(weatherZone)

            const locationId = crypto.randomUUID()
            await realmRepo.addWithinEdge(locationId, weatherZone.id)

            // Indefinite layer starting at tick 100
            await layerRepo.setLayerForRealm(weatherZone.id, 'weather', 100, null, 'Snow falls endlessly.')

            // Should be active at any tick >= 100
            const layer1 = await layerRepo.getActiveLayerForLocation(locationId, 'weather', 100)
            assert.ok(layer1)

            const layer2 = await layerRepo.getActiveLayerForLocation(locationId, 'weather', 10000)
            assert.ok(layer2)

            // Should not be active before tick 100
            const beforeLayer = await layerRepo.getActiveLayerForLocation(locationId, 'weather', 50)
            assert.strictEqual(beforeLayer, null)
        })
    })

    describe('Location Override Precedence', () => {
        test('should prioritize location-specific layer over realm layer', async () => {
            // Create a weather zone realm
            const weatherZone: RealmVertex = {
                id: crypto.randomUUID(),
                name: 'Rain Region',
                realmType: 'WEATHER_ZONE',
                scope: 'REGIONAL'
            }
            await realmRepo.upsert(weatherZone)

            const locationId = crypto.randomUUID()
            await realmRepo.addWithinEdge(locationId, weatherZone.id)

            // Set realm-wide weather
            await layerRepo.setLayerForRealm(weatherZone.id, 'weather', 1000, 2000, 'Rain falls across the region.')

            // Set location-specific override
            await layerRepo.setLayerForLocation(locationId, 'weather', 1000, 2000, 'Clear skies overhead.')

            // Query should return location layer, not realm layer
            const activeLayer = await layerRepo.getActiveLayerForLocation(locationId, 'weather', 1500)

            assert.ok(activeLayer, 'Should find active layer')
            assert.strictEqual(activeLayer.scopeId, `loc:${locationId}`)
            assert.strictEqual(activeLayer.value, 'Clear skies overhead.')
        })

        test('should fall back to realm layer when location layer expires', async () => {
            const weatherZone: RealmVertex = {
                id: crypto.randomUUID(),
                name: 'Variable Weather Zone',
                realmType: 'WEATHER_ZONE',
                scope: 'REGIONAL'
            }
            await realmRepo.upsert(weatherZone)

            const locationId = crypto.randomUUID()
            await realmRepo.addWithinEdge(locationId, weatherZone.id)

            // Realm layer: tick 1000-3000
            await layerRepo.setLayerForRealm(weatherZone.id, 'weather', 1000, 3000, 'Cloudy skies.')

            // Location override: tick 1000-2000 (shorter duration)
            await layerRepo.setLayerForLocation(locationId, 'weather', 1000, 2000, 'Sunny skies.')

            // At tick 1500: location override active
            const duringOverride = await layerRepo.getActiveLayerForLocation(locationId, 'weather', 1500)
            assert.ok(duringOverride)
            assert.strictEqual(duringOverride.value, 'Sunny skies.')

            // At tick 2500: location override expired, realm layer active
            const afterOverride = await layerRepo.getActiveLayerForLocation(locationId, 'weather', 2500)
            assert.ok(afterOverride)
            assert.strictEqual(afterOverride.value, 'Cloudy skies.')
        })
    })

    describe('Multi-Realm Scope Priority', () => {
        test('should prioritize LOCAL scope over REGIONAL scope', async () => {
            // Create LOCAL scope realm (more specific)
            const localRealm: RealmVertex = {
                id: crypto.randomUUID(),
                name: 'City District',
                realmType: 'DISTRICT',
                scope: 'LOCAL'
            }
            await realmRepo.upsert(localRealm)

            // Create REGIONAL scope realm (broader)
            const regionalRealm: RealmVertex = {
                id: crypto.randomUUID(),
                name: 'Province',
                realmType: 'KINGDOM',
                scope: 'REGIONAL'
            }
            await realmRepo.upsert(regionalRealm)

            const locationId = crypto.randomUUID()

            // Location is within both realms
            await realmRepo.addWithinEdge(locationId, localRealm.id)
            await realmRepo.addWithinEdge(locationId, regionalRealm.id)

            // Set layers in both realms
            await layerRepo.setLayerForRealm(regionalRealm.id, 'ambient', 1000, 2000, 'Provincial atmosphere.')
            await layerRepo.setLayerForRealm(localRealm.id, 'ambient', 1000, 2000, 'District atmosphere.')

            // Should return LOCAL scope layer
            const activeLayer = await layerRepo.getActiveLayerForLocation(locationId, 'ambient', 1500)

            assert.ok(activeLayer)
            assert.strictEqual(activeLayer.scopeId, `realm:${localRealm.id}`)
            assert.strictEqual(activeLayer.value, 'District atmosphere.')
        })
    })

    describe('Different Layer Types', () => {
        test('should support weather layer type', async () => {
            const locationId = crypto.randomUUID()

            const layer = await layerRepo.setLayerForLocation(locationId, 'weather', 0, null, 'Clear skies.')

            assert.strictEqual(layer.layerType, 'weather')
        })

        test('should support lighting layer type', async () => {
            const locationId = crypto.randomUUID()

            const layer = await layerRepo.setLayerForLocation(locationId, 'lighting', 0, null, 'Torches flicker.')

            assert.strictEqual(layer.layerType, 'lighting')
        })

        test('should isolate different layer types', async () => {
            const locationId = crypto.randomUUID()

            await layerRepo.setLayerForLocation(locationId, 'weather', 1000, 2000, 'Rain falls.')
            await layerRepo.setLayerForLocation(locationId, 'lighting', 1000, 2000, 'Dim light.')

            const weatherLayer = await layerRepo.getActiveLayerForLocation(locationId, 'weather', 1500)
            const lightingLayer = await layerRepo.getActiveLayerForLocation(locationId, 'lighting', 1500)

            assert.ok(weatherLayer)
            assert.ok(lightingLayer)
            assert.strictEqual(weatherLayer.value, 'Rain falls.')
            assert.strictEqual(lightingLayer.value, 'Dim light.')
        })
    })

    describe('Metadata Support', () => {
        test('should preserve metadata in realm layers', async () => {
            const realmId = crypto.randomUUID()
            const locationId = crypto.randomUUID()

            await realmRepo.upsert({
                id: realmId,
                name: 'Storm Zone',
                realmType: 'WEATHER_ZONE',
                scope: 'REGIONAL'
            })
            await realmRepo.addWithinEdge(locationId, realmId)

            await layerRepo.setLayerForRealm(realmId, 'weather', 1000, 2000, 'Storm clouds gather.', {
                intensity: 'severe',
                windSpeed: 45
            })

            const layer = await layerRepo.getActiveLayerForLocation(locationId, 'weather', 1500)

            assert.ok(layer)
            assert.ok(layer.metadata)
            assert.strictEqual(layer.metadata.intensity, 'severe')
            assert.strictEqual(layer.metadata.windSpeed, 45)
        })
    })

    describe('E2E Scenario: Zone Weather with Location Override', () => {
        test('should handle zone weather affecting all locations with one override', async () => {
            // Create weather zone
            const weatherZone: RealmVertex = {
                id: crypto.randomUUID(),
                name: 'Rainy Zone',
                realmType: 'WEATHER_ZONE',
                scope: 'REGIONAL'
            }
            await realmRepo.upsert(weatherZone)

            // Create three locations in the zone
            const location1 = crypto.randomUUID()
            const location2 = crypto.randomUUID()
            const location3 = crypto.randomUUID()

            await realmRepo.addWithinEdge(location1, weatherZone.id)
            await realmRepo.addWithinEdge(location2, weatherZone.id)
            await realmRepo.addWithinEdge(location3, weatherZone.id)

            // Set zone-wide weather
            await layerRepo.setLayerForRealm(weatherZone.id, 'weather', 1000, 2000, 'Rain falls across the zone.')

            // All locations should see the zone weather
            const layer1 = await layerRepo.getActiveLayerForLocation(location1, 'weather', 1500)
            const layer2 = await layerRepo.getActiveLayerForLocation(location2, 'weather', 1500)
            const layer3 = await layerRepo.getActiveLayerForLocation(location3, 'weather', 1500)

            assert.ok(layer1)
            assert.ok(layer2)
            assert.ok(layer3)
            assert.strictEqual(layer1.value, 'Rain falls across the zone.')
            assert.strictEqual(layer2.value, 'Rain falls across the zone.')
            assert.strictEqual(layer3.value, 'Rain falls across the zone.')

            // Override location 2 specifically
            await layerRepo.setLayerForLocation(location2, 'weather', 1000, 2000, 'A magical barrier keeps the rain out.')

            // Location 1 and 3 still see zone weather
            const layer1After = await layerRepo.getActiveLayerForLocation(location1, 'weather', 1500)
            const layer3After = await layerRepo.getActiveLayerForLocation(location3, 'weather', 1500)

            assert.strictEqual(layer1After?.value, 'Rain falls across the zone.')
            assert.strictEqual(layer3After?.value, 'Rain falls across the zone.')

            // Location 2 sees override
            const layer2After = await layerRepo.getActiveLayerForLocation(location2, 'weather', 1500)
            assert.strictEqual(layer2After?.value, 'A magical barrier keeps the rain out.')
        })
    })
})
