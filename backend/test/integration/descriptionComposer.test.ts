/**
 * Integration tests for Description Composer Service
 *
 * Tests compilation with real repository implementations (memory mode).
 *
 * Design: The base description comes from Location.description (passed via options.baseDescription).
 * Layers in the repository (dynamic, ambient, enhancement) are overlays applied on top of the base.
 */

import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { ViewContext } from '../../src/services/types.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describe('Description Composer Integration', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('should compile location with multiple layer types', async () => {
        const composer = await fixture.getDescriptionComposer()
        const layerRepo = await fixture.getLayerRepository()
        const locationId = crypto.randomUUID()

        const baseDescription = 'A marketplace bustles with activity. Wooden stalls line the square.'

        // Add structural (dynamic) layer
        await layerRepo.addLayer({
            id: crypto.randomUUID(),
            locationId,
            layerType: 'dynamic',
            content: 'One stall has been overturned, its goods scattered across the cobbles.',
            priority: 75,
            authoredAt: new Date().toISOString()
        })

        // Add ambient layer for day
        await layerRepo.addLayer({
            id: crypto.randomUUID(),
            locationId,
            layerType: 'ambient',
            content: 'Afternoon sunlight casts long shadows.',
            priority: 50,
            authoredAt: new Date().toISOString(),
            attributes: {
                timeBucket: 'day'
            }
        })

        // Add ambient layer for night (should be filtered out)
        await layerRepo.addLayer({
            id: crypto.randomUUID(),
            locationId,
            layerType: 'ambient',
            content: 'Torches flicker in the darkness.',
            priority: 50,
            authoredAt: new Date().toISOString(),
            attributes: {
                timeBucket: 'night'
            }
        })

        const context: ViewContext = {
            time: 'day',
            timestamp: new Date().toISOString()
        }

        const result = await composer.compileForLocation(locationId, context, { baseDescription })

        // Should have base + structural + day ambient
        assert.ok(result.text.includes('marketplace'))
        assert.ok(result.text.includes('overturned'))
        assert.ok(result.text.includes('sunlight'))
        assert.ok(!result.text.includes('Torches'))

        // Should have 2 layers in provenance (dynamic + ambient)
        assert.strictEqual(result.provenance.layers.length, 2)

        // HTML should be converted
        assert.ok(result.html.length > 0)
    })

    test('should compile location with empty layers (base only)', async () => {
        const composer = await fixture.getDescriptionComposer()
        const locationId = crypto.randomUUID()

        const baseDescription = 'A quiet glade surrounded by ancient oaks.'

        const context: ViewContext = {
            timestamp: new Date().toISOString()
        }

        // No layers in repository, just base description
        const result = await composer.compileForLocation(locationId, context, { baseDescription })

        assert.strictEqual(result.text, 'A quiet glade surrounded by ancient oaks.')
        assert.ok(result.html.includes('quiet glade'))
        assert.strictEqual(result.provenance.layers.length, 0) // No overlay layers
    })

    test('should compile location with single base-only layer', async () => {
        const composer = await fixture.getDescriptionComposer()
        const locationId = crypto.randomUUID()

        const baseDescription = 'The throne room is vast and imposing.'

        const context: ViewContext = {
            timestamp: new Date().toISOString()
        }

        // No layers in repository
        const result = await composer.compileForLocation(locationId, context, { baseDescription })

        assert.ok(result.text.includes('throne room'))
        assert.strictEqual(result.provenance.layers.length, 0)
    })

    test('should handle complex supersede scenario with multiple replacements', async () => {
        const composer = await fixture.getDescriptionComposer()
        const layerRepo = await fixture.getLayerRepository()
        const locationId = crypto.randomUUID()

        // Base with multiple sentences
        const baseDescription = 'A wooden gate stands at the entrance. The walls are made of stone. Guards patrol the battlements.'

        // Structural layer superseding first sentence
        await layerRepo.addLayer({
            id: crypto.randomUUID(),
            locationId,
            layerType: 'dynamic',
            content: 'The gate has been destroyed.',
            priority: 75,
            authoredAt: new Date().toISOString(),
            attributes: {
                supersedes: ['A wooden gate stands at the entrance']
            }
        })

        // Another structural layer superseding third sentence
        await layerRepo.addLayer({
            id: crypto.randomUUID(),
            locationId,
            layerType: 'dynamic',
            content: 'The battlements are abandoned.',
            priority: 74,
            authoredAt: new Date().toISOString(),
            attributes: {
                supersedes: ['Guards patrol the battlements']
            }
        })

        const context: ViewContext = {
            timestamp: new Date().toISOString()
        }

        const result = await composer.compileForLocation(locationId, context, { baseDescription })

        // First and third sentences should be superseded
        assert.ok(!result.text.includes('wooden gate stands'))
        assert.ok(!result.text.includes('Guards patrol'))

        // Second sentence should remain
        assert.ok(result.text.includes('walls are made of stone'))

        // Replacements should be present
        assert.ok(result.text.includes('gate has been destroyed'))
        assert.ok(result.text.includes('battlements are abandoned'))
    })

    test('should maintain deterministic ordering across multiple compilations', async () => {
        const composer = await fixture.getDescriptionComposer()
        const layerRepo = await fixture.getLayerRepository()
        const locationId = crypto.randomUUID()

        const baseDescription = 'Base content.'

        // Add layers with same priority
        await layerRepo.addLayer({
            id: 'layer-alpha',
            locationId,
            layerType: 'ambient',
            content: 'Alpha layer.',
            priority: 50,
            authoredAt: new Date().toISOString()
        })

        await layerRepo.addLayer({
            id: 'layer-beta',
            locationId,
            layerType: 'ambient',
            content: 'Beta layer.',
            priority: 50,
            authoredAt: new Date().toISOString()
        })

        await layerRepo.addLayer({
            id: 'layer-gamma',
            locationId,
            layerType: 'ambient',
            content: 'Gamma layer.',
            priority: 50,
            authoredAt: new Date().toISOString()
        })

        const context: ViewContext = {
            timestamp: new Date().toISOString()
        }

        // Compile multiple times
        const results = await Promise.all([
            composer.compileForLocation(locationId, context, { baseDescription }),
            composer.compileForLocation(locationId, context, { baseDescription }),
            composer.compileForLocation(locationId, context, { baseDescription })
        ])

        // All results should be identical
        assert.strictEqual(results[0].text, results[1].text)
        assert.strictEqual(results[1].text, results[2].text)

        // Layers should be in alphabetical order by ID
        assert.strictEqual(results[0].provenance.layers[0].id, 'layer-alpha')
        assert.strictEqual(results[0].provenance.layers[1].id, 'layer-beta')
        assert.strictEqual(results[0].provenance.layers[2].id, 'layer-gamma')
    })

    test('should handle weather and time filtering together', async () => {
        const composer = await fixture.getDescriptionComposer()
        const layerRepo = await fixture.getLayerRepository()
        const locationId = crypto.randomUUID()

        const baseDescription = 'A forest path.'

        // Rain during day
        await layerRepo.addLayer({
            id: crypto.randomUUID(),
            locationId,
            layerType: 'ambient',
            content: 'Rain patters on the leaves in daylight.',
            priority: 50,
            authoredAt: new Date().toISOString(),
            attributes: {
                weatherType: 'rain',
                timeBucket: 'day'
            }
        })

        // Rain during night
        await layerRepo.addLayer({
            id: crypto.randomUUID(),
            locationId,
            layerType: 'ambient',
            content: 'Rain falls in darkness.',
            priority: 50,
            authoredAt: new Date().toISOString(),
            attributes: {
                weatherType: 'rain',
                timeBucket: 'night'
            }
        })

        // Clear day
        await layerRepo.addLayer({
            id: crypto.randomUUID(),
            locationId,
            layerType: 'ambient',
            content: 'Sunlight filters through the trees.',
            priority: 50,
            authoredAt: new Date().toISOString(),
            attributes: {
                weatherType: 'clear',
                timeBucket: 'day'
            }
        })

        // Test rain + day
        const rainDayResult = await composer.compileForLocation(
            locationId,
            {
                weather: 'rain',
                time: 'day',
                timestamp: new Date().toISOString()
            },
            { baseDescription }
        )

        assert.ok(rainDayResult.text.includes('patters on the leaves in daylight'))
        assert.ok(!rainDayResult.text.includes('darkness'))
        assert.ok(!rainDayResult.text.includes('Sunlight filters'))

        // Test rain + night
        const rainNightResult = await composer.compileForLocation(
            locationId,
            {
                weather: 'rain',
                time: 'night',
                timestamp: new Date().toISOString()
            },
            { baseDescription }
        )

        assert.ok(rainNightResult.text.includes('falls in darkness'))
        assert.ok(!rainNightResult.text.includes('daylight'))

        // Test clear + day
        const clearDayResult = await composer.compileForLocation(
            locationId,
            {
                weather: 'clear',
                time: 'day',
                timestamp: new Date().toISOString()
            },
            { baseDescription }
        )

        assert.ok(clearDayResult.text.includes('Sunlight filters'))
        assert.ok(!clearDayResult.text.includes('Rain'))
    })

    test('should handle location with no matching ambient layers', async () => {
        const composer = await fixture.getDescriptionComposer()
        const layerRepo = await fixture.getLayerRepository()
        const locationId = crypto.randomUUID()

        const baseDescription = 'A bridge spans the river.'

        // Only snow ambient layer
        await layerRepo.addLayer({
            id: crypto.randomUUID(),
            locationId,
            layerType: 'ambient',
            content: 'Snow covers everything.',
            priority: 50,
            authoredAt: new Date().toISOString(),
            attributes: {
                weatherType: 'snow'
            }
        })

        // Request with rain context (no matching layer)
        const result = await composer.compileForLocation(
            locationId,
            {
                weather: 'rain',
                timestamp: new Date().toISOString()
            },
            { baseDescription }
        )

        // Should only have base
        assert.strictEqual(result.text, 'A bridge spans the river.')
        assert.ok(!result.text.includes('Snow'))
        assert.strictEqual(result.provenance.layers.length, 0)
    })

    test('should include ambient layers without weather/time attributes', async () => {
        const composer = await fixture.getDescriptionComposer()
        const layerRepo = await fixture.getLayerRepository()
        const locationId = crypto.randomUUID()

        const baseDescription = 'A temple entrance.'

        // Ambient layer without weather/time attributes (always active)
        await layerRepo.addLayer({
            id: crypto.randomUUID(),
            locationId,
            layerType: 'ambient',
            content: 'Incense smoke drifts from within.',
            priority: 50,
            authoredAt: new Date().toISOString()
        })

        const result = await composer.compileForLocation(
            locationId,
            {
                weather: 'clear',
                time: 'day',
                timestamp: new Date().toISOString()
            },
            { baseDescription }
        )

        // Ambient layer should be included regardless of context
        assert.ok(result.text.includes('Incense smoke'))
    })
})
