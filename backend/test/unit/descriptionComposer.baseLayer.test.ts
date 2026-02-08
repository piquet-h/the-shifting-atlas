/**
 * Unit tests for Description Composer - Base Layer Priority
 *
 * Tests that Description Composer prefers base layers from repository over options.baseDescription.
 * This ensures AI-generated descriptions stored as layers take precedence over legacy Location.description.
 */

import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { ViewContext } from '../../src/services/types.js'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'

describe('Description Composer - Base Layer Priority', () => {
    let fixture: UnitTestFixture

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('should use base layer from repository when available', async () => {
        const composer = await fixture.getDescriptionComposer()
        const layerRepo = await fixture.getLayerRepository()
        const locationId = crypto.randomUUID()

        // Add base layer to repository (AI-generated description)
        await layerRepo.setLayerForLocation(
            locationId,
            'base',
            0, // effectiveFromTick
            null, // effectiveToTick (indefinite)
            'Windswept moorland stretches beneath vast sky.',
            {
                model: 'gpt-4',
                generatedAt: new Date().toISOString()
            }
        )

        const context: ViewContext = {
            weather: 'clear',
            time: 'day',
            timestamp: new Date().toISOString()
        }

        // Do NOT pass baseDescription via options
        const result = await composer.compileForLocation(locationId, context)

        assert.strictEqual(result.text, 'Windswept moorland stretches beneath vast sky.')
        assert.ok(result.html.includes('Windswept moorland'))
    })

    test('should prefer base layer over options.baseDescription when both exist', async () => {
        const composer = await fixture.getDescriptionComposer()
        const layerRepo = await fixture.getLayerRepository()
        const locationId = crypto.randomUUID()

        // Add base layer to repository
        await layerRepo.setLayerForLocation(
            locationId,
            'base',
            0,
            null,
            'AI-generated description of the location.',
            { model: 'gpt-4' }
        )

        const context: ViewContext = {
            weather: 'clear',
            time: 'day',
            timestamp: new Date().toISOString()
        }

        // Pass legacy baseDescription via options (should be ignored)
        const result = await composer.compileForLocation(locationId, context, {
            baseDescription: 'Legacy location description from graph.'
        })

        // Should use base layer, NOT options.baseDescription
        assert.strictEqual(result.text, 'AI-generated description of the location.')
        assert.ok(!result.text.includes('Legacy'))
    })

    test('should fall back to options.baseDescription when no base layer exists', async () => {
        const composer = await fixture.getDescriptionComposer()
        const locationId = crypto.randomUUID()

        const context: ViewContext = {
            weather: 'clear',
            time: 'day',
            timestamp: new Date().toISOString()
        }

        // No base layer in repository, only legacy baseDescription
        const result = await composer.compileForLocation(locationId, context, {
            baseDescription: 'Legacy location description.'
        })

        // Should fall back to options.baseDescription
        assert.strictEqual(result.text, 'Legacy location description.')
    })

    test('should compose base layer with overlay layers', async () => {
        const composer = await fixture.getDescriptionComposer()
        const layerRepo = await fixture.getLayerRepository()
        const locationId = crypto.randomUUID()

        // Add base layer
        await layerRepo.setLayerForLocation(locationId, 'base', 0, null, 'A stone courtyard opens before you.')

        // Add ambient layer (overlay)
        await layerRepo.setLayerForLocation(locationId, 'ambient', 0, null, 'Moonlight reflects off ancient cobbles.')

        const context: ViewContext = {
            weather: 'clear',
            time: 'night',
            timestamp: new Date().toISOString()
        }

        const result = await composer.compileForLocation(locationId, context)

        // Should have both base and ambient layer
        assert.ok(result.text.includes('stone courtyard'))
        assert.ok(result.text.includes('Moonlight'))
        // Base layer is the foundation, ambient is an overlay
        assert.strictEqual(result.provenance.layers.length, 1) // Only ambient counts as overlay
    })

    test('should use most recently authored base layer when multiple exist', async () => {
        const composer = await fixture.getDescriptionComposer()
        const layerRepo = await fixture.getLayerRepository()
        const locationId = crypto.randomUUID()

        // Add first base layer
        await layerRepo.setLayerForLocation(locationId, 'base', 0, null, 'First description.')

        // Add second base layer (more recent)
        await layerRepo.setLayerForLocation(locationId, 'base', 0, null, 'Second description.')

        const context: ViewContext = {
            timestamp: new Date().toISOString()
        }

        const result = await composer.compileForLocation(locationId, context)

        // Should use most recently authored base layer
        assert.strictEqual(result.text, 'Second description.')
    })
})
