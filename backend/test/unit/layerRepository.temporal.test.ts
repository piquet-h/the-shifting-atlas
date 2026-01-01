/**
 * Unit tests for Layer Repository Temporal Methods
 * Tests new temporal query methods and overlapping interval edge cases
 */

import assert from 'node:assert'
import { describe, test } from 'node:test'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'

describe('Layer Repository Temporal Methods (Unit)', () => {
    describe('getActiveLayer (direct scope query)', () => {
        test('should return active layer for location scope at specific tick', async () => {
            const fixture = new UnitTestFixture()
            await fixture.setup()
            const layerRepo = await fixture.getLayerRepository()

            const locationId = crypto.randomUUID()
            const scopeId = `loc:${locationId}`

            // Set layer active from tick 1000 to 2000
            await layerRepo.setLayerInterval(scopeId, 'weather', 1000, 2000, 'Sunny skies.')

            // Query at tick 1500 (within range)
            const layer = await layerRepo.getActiveLayer(scopeId, 'weather', 1500)

            assert.ok(layer, 'Should find active layer')
            assert.strictEqual(layer.scopeId, scopeId)
            assert.strictEqual(layer.layerType, 'weather')
            assert.strictEqual(layer.value, 'Sunny skies.')
            assert.strictEqual(layer.effectiveFromTick, 1000)
            assert.strictEqual(layer.effectiveToTick, 2000)

            await fixture.teardown()
        })

        test('should return null when no layer active at tick', async () => {
            const fixture = new UnitTestFixture()
            await fixture.setup()
            const layerRepo = await fixture.getLayerRepository()

            const scopeId = `loc:${crypto.randomUUID()}`

            // Set layer active from tick 1000 to 2000
            await layerRepo.setLayerInterval(scopeId, 'weather', 1000, 2000, 'Rainy.')

            // Query before range
            const beforeLayer = await layerRepo.getActiveLayer(scopeId, 'weather', 500)
            assert.strictEqual(beforeLayer, null)

            // Query after range
            const afterLayer = await layerRepo.getActiveLayer(scopeId, 'weather', 2500)
            assert.strictEqual(afterLayer, null)

            await fixture.teardown()
        })

        test('should return layer with indefinite toTick (null)', async () => {
            const fixture = new UnitTestFixture()
            await fixture.setup()
            const layerRepo = await fixture.getLayerRepository()

            const scopeId = `realm:${crypto.randomUUID()}`

            // Set indefinite layer starting at tick 100
            await layerRepo.setLayerInterval(scopeId, 'ambient', 100, null, 'Eternal fog.')

            // Should be active at any tick >= 100
            const layer1 = await layerRepo.getActiveLayer(scopeId, 'ambient', 100)
            assert.ok(layer1)

            const layer2 = await layerRepo.getActiveLayer(scopeId, 'ambient', 10000)
            assert.ok(layer2)

            // Should not be active before tick 100
            const beforeLayer = await layerRepo.getActiveLayer(scopeId, 'ambient', 50)
            assert.strictEqual(beforeLayer, null)

            await fixture.teardown()
        })

        test('should isolate different layer types', async () => {
            const fixture = new UnitTestFixture()
            await fixture.setup()
            const layerRepo = await fixture.getLayerRepository()

            const scopeId = `loc:${crypto.randomUUID()}`

            await layerRepo.setLayerInterval(scopeId, 'weather', 1000, 2000, 'Rain falls.')
            await layerRepo.setLayerInterval(scopeId, 'lighting', 1000, 2000, 'Dim light.')

            const weatherLayer = await layerRepo.getActiveLayer(scopeId, 'weather', 1500)
            const lightingLayer = await layerRepo.getActiveLayer(scopeId, 'lighting', 1500)

            assert.ok(weatherLayer)
            assert.ok(lightingLayer)
            assert.strictEqual(weatherLayer.value, 'Rain falls.')
            assert.strictEqual(lightingLayer.value, 'Dim light.')

            await fixture.teardown()
        })
    })

    describe('setLayerInterval (generic setter)', () => {
        test('should set layer for location scope', async () => {
            const fixture = new UnitTestFixture()
            await fixture.setup()
            const layerRepo = await fixture.getLayerRepository()

            const locationId = crypto.randomUUID()
            const scopeId = `loc:${locationId}`

            const layer = await layerRepo.setLayerInterval(scopeId, 'weather', 1000, 2000, 'Cloudy skies.')

            assert.ok(layer)
            assert.strictEqual(layer.scopeId, scopeId)
            assert.strictEqual(layer.layerType, 'weather')
            assert.strictEqual(layer.value, 'Cloudy skies.')
            assert.strictEqual(layer.effectiveFromTick, 1000)
            assert.strictEqual(layer.effectiveToTick, 2000)
            assert.ok(layer.id)
            assert.ok(layer.authoredAt)

            await fixture.teardown()
        })

        test('should set layer for realm scope', async () => {
            const fixture = new UnitTestFixture()
            await fixture.setup()
            const layerRepo = await fixture.getLayerRepository()

            const realmId = crypto.randomUUID()
            const scopeId = `realm:${realmId}`

            const layer = await layerRepo.setLayerInterval(scopeId, 'ambient', 500, null, 'Birds chirp.')

            assert.ok(layer)
            assert.strictEqual(layer.scopeId, scopeId)
            assert.strictEqual(layer.effectiveFromTick, 500)
            assert.strictEqual(layer.effectiveToTick, null)

            await fixture.teardown()
        })

        test('should preserve metadata', async () => {
            const fixture = new UnitTestFixture()
            await fixture.setup()
            const layerRepo = await fixture.getLayerRepository()

            const scopeId = `realm:${crypto.randomUUID()}`
            const metadata = { intensity: 'severe', windSpeed: 45 }

            const layer = await layerRepo.setLayerInterval(scopeId, 'weather', 1000, 2000, 'Storm brewing.', metadata)

            assert.ok(layer.metadata)
            assert.strictEqual(layer.metadata.intensity, 'severe')
            assert.strictEqual(layer.metadata.windSpeed, 45)

            await fixture.teardown()
        })
    })

    describe('queryLayerHistory', () => {
        test('should return all layers for scope+type in chronological order', async () => {
            const fixture = new UnitTestFixture()
            await fixture.setup()
            const layerRepo = await fixture.getLayerRepository()

            const scopeId = `loc:${crypto.randomUUID()}`

            // Create layers in non-chronological order
            await layerRepo.setLayerInterval(scopeId, 'weather', 2000, 3000, 'Cloudy')
            await layerRepo.setLayerInterval(scopeId, 'weather', 1000, 2000, 'Sunny')
            await layerRepo.setLayerInterval(scopeId, 'weather', 3000, null, 'Rainy')

            const history = await layerRepo.queryLayerHistory(scopeId, 'weather')

            assert.strictEqual(history.length, 3)
            // Should be sorted by effectiveFromTick ascending
            assert.strictEqual(history[0].effectiveFromTick, 1000)
            assert.strictEqual(history[0].value, 'Sunny')
            assert.strictEqual(history[1].effectiveFromTick, 2000)
            assert.strictEqual(history[1].value, 'Cloudy')
            assert.strictEqual(history[2].effectiveFromTick, 3000)
            assert.strictEqual(history[2].value, 'Rainy')

            await fixture.teardown()
        })

        test('should filter by startTick (inclusive)', async () => {
            const fixture = new UnitTestFixture()
            await fixture.setup()
            const layerRepo = await fixture.getLayerRepository()

            const scopeId = `loc:${crypto.randomUUID()}`

            await layerRepo.setLayerInterval(scopeId, 'weather', 1000, 2000, 'Early')
            await layerRepo.setLayerInterval(scopeId, 'weather', 2000, 3000, 'Middle')
            await layerRepo.setLayerInterval(scopeId, 'weather', 3000, 4000, 'Late')

            const history = await layerRepo.queryLayerHistory(scopeId, 'weather', 2000)

            assert.strictEqual(history.length, 2)
            assert.strictEqual(history[0].value, 'Middle')
            assert.strictEqual(history[1].value, 'Late')

            await fixture.teardown()
        })

        test('should filter by endTick (inclusive)', async () => {
            const fixture = new UnitTestFixture()
            await fixture.setup()
            const layerRepo = await fixture.getLayerRepository()

            const scopeId = `loc:${crypto.randomUUID()}`

            await layerRepo.setLayerInterval(scopeId, 'weather', 1000, 2000, 'Early')
            await layerRepo.setLayerInterval(scopeId, 'weather', 2000, 3000, 'Middle')
            await layerRepo.setLayerInterval(scopeId, 'weather', 3000, 4000, 'Late')

            const history = await layerRepo.queryLayerHistory(scopeId, 'weather', undefined, 3000)

            assert.strictEqual(history.length, 2)
            assert.strictEqual(history[0].value, 'Early')
            assert.strictEqual(history[1].value, 'Middle')

            await fixture.teardown()
        })

        test('should filter by both startTick and endTick', async () => {
            const fixture = new UnitTestFixture()
            await fixture.setup()
            const layerRepo = await fixture.getLayerRepository()

            const scopeId = `loc:${crypto.randomUUID()}`

            await layerRepo.setLayerInterval(scopeId, 'weather', 1000, 2000, 'Early')
            await layerRepo.setLayerInterval(scopeId, 'weather', 2000, 3000, 'Middle')
            await layerRepo.setLayerInterval(scopeId, 'weather', 3000, 4000, 'Late')

            const history = await layerRepo.queryLayerHistory(scopeId, 'weather', 2000, 3000)

            assert.strictEqual(history.length, 1)
            assert.strictEqual(history[0].value, 'Middle')

            await fixture.teardown()
        })

        test('should include indefinite layers (toTick: null) in results', async () => {
            const fixture = new UnitTestFixture()
            await fixture.setup()
            const layerRepo = await fixture.getLayerRepository()

            const scopeId = `realm:${crypto.randomUUID()}`

            await layerRepo.setLayerInterval(scopeId, 'weather', 1000, 2000, 'Temporary')
            await layerRepo.setLayerInterval(scopeId, 'weather', 2000, null, 'Permanent')

            const history = await layerRepo.queryLayerHistory(scopeId, 'weather')

            assert.strictEqual(history.length, 2)
            assert.strictEqual(history[1].value, 'Permanent')
            assert.strictEqual(history[1].effectiveToTick, null)

            await fixture.teardown()
        })

        test('should return empty array when no layers match', async () => {
            const fixture = new UnitTestFixture()
            await fixture.setup()
            const layerRepo = await fixture.getLayerRepository()

            const scopeId = `loc:${crypto.randomUUID()}`

            const history = await layerRepo.queryLayerHistory(scopeId, 'weather')

            assert.ok(Array.isArray(history))
            assert.strictEqual(history.length, 0)

            await fixture.teardown()
        })

        test('should isolate different layer types in history', async () => {
            const fixture = new UnitTestFixture()
            await fixture.setup()
            const layerRepo = await fixture.getLayerRepository()

            const scopeId = `loc:${crypto.randomUUID()}`

            await layerRepo.setLayerInterval(scopeId, 'weather', 1000, 2000, 'Weather 1')
            await layerRepo.setLayerInterval(scopeId, 'lighting', 1000, 2000, 'Lighting 1')
            await layerRepo.setLayerInterval(scopeId, 'weather', 2000, 3000, 'Weather 2')

            const weatherHistory = await layerRepo.queryLayerHistory(scopeId, 'weather')
            const lightingHistory = await layerRepo.queryLayerHistory(scopeId, 'lighting')

            assert.strictEqual(weatherHistory.length, 2)
            assert.strictEqual(lightingHistory.length, 1)

            await fixture.teardown()
        })
    })

    describe('Overlapping Intervals Edge Cases', () => {
        test('should allow overlapping intervals (last-authored-wins policy)', async () => {
            const fixture = new UnitTestFixture()
            await fixture.setup()
            const layerRepo = await fixture.getLayerRepository()

            const scopeId = `loc:${crypto.randomUUID()}`

            // Create two overlapping layers
            await layerRepo.setLayerInterval(scopeId, 'weather', 1000, 3000, 'First layer')
            // Wait 1ms to ensure different authored timestamps
            await new Promise((resolve) => setTimeout(resolve, 1))
            const layer2 = await layerRepo.setLayerInterval(scopeId, 'weather', 2000, 4000, 'Second layer')

            // At tick 2500 (overlapping region), should return most recently authored
            const activeLayer = await layerRepo.getActiveLayer(scopeId, 'weather', 2500)

            assert.ok(activeLayer)
            assert.strictEqual(activeLayer.value, 'Second layer')
            assert.ok(activeLayer.authoredAt > layer2.authoredAt || activeLayer.id === layer2.id)

            await fixture.teardown()
        })

        test('should handle multiple overlapping layers with last-authored precedence', async () => {
            const fixture = new UnitTestFixture()
            await fixture.setup()
            const layerRepo = await fixture.getLayerRepository()

            const scopeId = `realm:${crypto.randomUUID()}`

            // Create three overlapping layers
            await layerRepo.setLayerInterval(scopeId, 'weather', 1000, 4000, 'Layer 1')
            await new Promise((resolve) => setTimeout(resolve, 1))
            await layerRepo.setLayerInterval(scopeId, 'weather', 2000, 5000, 'Layer 2')
            await new Promise((resolve) => setTimeout(resolve, 1))
            await layerRepo.setLayerInterval(scopeId, 'weather', 3000, 6000, 'Layer 3')

            // At tick 3500 (all three overlap), should return the last authored
            const activeLayer = await layerRepo.getActiveLayer(scopeId, 'weather', 3500)

            assert.ok(activeLayer)
            assert.strictEqual(activeLayer.value, 'Layer 3')

            await fixture.teardown()
        })

        test('should handle indefinite layer overlapping with bounded layer', async () => {
            const fixture = new UnitTestFixture()
            await fixture.setup()
            const layerRepo = await fixture.getLayerRepository()

            const scopeId = `loc:${crypto.randomUUID()}`

            // Indefinite layer starting at 1000
            await layerRepo.setLayerInterval(scopeId, 'weather', 1000, null, 'Indefinite weather')
            await new Promise((resolve) => setTimeout(resolve, 1))
            // Bounded layer overlapping
            await layerRepo.setLayerInterval(scopeId, 'weather', 2000, 3000, 'Temporary override')

            // At tick 2500 (overlap), should return most recently authored (temporary)
            const duringOverride = await layerRepo.getActiveLayer(scopeId, 'weather', 2500)
            assert.strictEqual(duringOverride?.value, 'Temporary override')

            // At tick 4000 (after override), should return indefinite (most recent authored)
            // Note: This depends on which was authored last
            const afterOverride = await layerRepo.getActiveLayer(scopeId, 'weather', 4000)
            assert.ok(afterOverride)

            await fixture.teardown()
        })

        test('should document overlap policy: chronologically active + last-authored wins', async () => {
            const fixture = new UnitTestFixture()
            await fixture.setup()
            const layerRepo = await fixture.getLayerRepository()

            const scopeId = `loc:${crypto.randomUUID()}`

            // Policy test: Multiple layers active at same tick
            const timestamps: string[] = []

            const layer1 = await layerRepo.setLayerInterval(scopeId, 'weather', 1000, 5000, 'Option A')
            timestamps.push(layer1.authoredAt)
            await new Promise((resolve) => setTimeout(resolve, 2))

            const layer2 = await layerRepo.setLayerInterval(scopeId, 'weather', 1000, 5000, 'Option B')
            timestamps.push(layer2.authoredAt)
            await new Promise((resolve) => setTimeout(resolve, 2))

            const layer3 = await layerRepo.setLayerInterval(scopeId, 'weather', 1000, 5000, 'Option C')
            timestamps.push(layer3.authoredAt)

            // All have identical temporal ranges - last authored should win
            const activeLayer = await layerRepo.getActiveLayer(scopeId, 'weather', 3000)

            assert.ok(activeLayer)
            assert.strictEqual(activeLayer.value, 'Option C')
            assert.strictEqual(activeLayer.authoredAt, timestamps[2])

            // Verify ordering: timestamps should be ascending
            assert.ok(timestamps[0] < timestamps[1])
            assert.ok(timestamps[1] < timestamps[2])

            await fixture.teardown()
        })
    })
})
