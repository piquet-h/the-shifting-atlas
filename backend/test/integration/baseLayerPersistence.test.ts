/**
 * Integration test for base location description layer persistence
 *
 * Tests the end-to-end workflow:
 * 1. AIDescriptionService generates and persists base layer
 * 2. DescriptionComposer retrieves and uses base layer
 * 3. Base layers are properly scoped and queryable
 */

import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { Direction, TerrainType } from '@piquet-h/shared'
import type { IAIDescriptionService, BatchDescriptionRequest } from '../../src/services/AIDescriptionService.js'
import { TOKENS } from '../../src/di/tokens.js'
import type { ViewContext } from '../../src/services/types.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

/**
 * Helper to create a minimal valid batch request for testing
 */
function createBatchRequest(locationId: string): BatchDescriptionRequest {
    return {
        locations: [
            {
                locationId,
                terrain: 'open-plain' as TerrainType,
                arrivalDirection: 'north' as Direction,
                neighbors: ['south', 'east', 'west'] as Direction[]
            }
        ],
        style: 'atmospheric'
    }
}

describe('Base Layer Persistence Integration', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('AIDescriptionService persists base layer that DescriptionComposer can retrieve', async () => {
        const container = await fixture.getContainer()
        const aiService = container.get<IAIDescriptionService>(TOKENS.AIDescriptionService)
        const composer = await fixture.getDescriptionComposer()
        const layerRepo = await fixture.getLayerRepository()

        const locationId = crypto.randomUUID()
        const request = createBatchRequest(locationId)

        // Generate descriptions (should persist base layer)
        const results = await aiService.batchGenerateDescriptions(request)
        assert.strictEqual(results.length, 1)
        const generatedDesc = results[0].description

        // Verify base layer was persisted
        const scopeId = `loc:${locationId}`
        const baseLayers = await layerRepo.queryLayerHistory(scopeId, 'base')
        assert.strictEqual(baseLayers.length, 1)
        assert.strictEqual(baseLayers[0].value, generatedDesc)
        assert.strictEqual(baseLayers[0].scopeId, scopeId)
        assert.strictEqual(baseLayers[0].effectiveFromTick, 0)
        assert.strictEqual(baseLayers[0].effectiveToTick, null)

        // Verify DescriptionComposer uses the base layer
        const context: ViewContext = {
            weather: 'clear',
            time: 'day',
            timestamp: new Date().toISOString()
        }

        const compiled = await composer.compileForLocation(locationId, context)
        assert.strictEqual(compiled.text, generatedDesc)
    })

    test('DescriptionComposer composes base layer with overlays', async () => {
        const container = await fixture.getContainer()
        const aiService = container.get<IAIDescriptionService>(TOKENS.AIDescriptionService)
        const composer = await fixture.getDescriptionComposer()
        const layerRepo = await fixture.getLayerRepository()

        const locationId = crypto.randomUUID()
        const request = createBatchRequest(locationId)

        // Generate and persist base layer
        await aiService.batchGenerateDescriptions(request)

        // Add an ambient layer on top
        await layerRepo.setLayerForLocation(locationId, 'ambient', 0, null, 'Soft wind rustles nearby grass.')

        const context: ViewContext = {
            timestamp: new Date().toISOString()
        }

        const compiled = await composer.compileForLocation(locationId, context)

        // Should have both base and ambient
        assert.ok(compiled.text.length > 0)
        assert.ok(compiled.text.includes('Soft wind'))
    })

    test('base layer metadata includes generation details', async () => {
        const container = await fixture.getContainer()
        const aiService = container.get<IAIDescriptionService>(TOKENS.AIDescriptionService)
        const layerRepo = await fixture.getLayerRepository()

        const locationId = crypto.randomUUID()
        const request = createBatchRequest(locationId)

        await aiService.batchGenerateDescriptions(request)

        const scopeId = `loc:${locationId}`
        const baseLayers = await layerRepo.queryLayerHistory(scopeId, 'base')
        assert.strictEqual(baseLayers.length, 1)

        const metadata = baseLayers[0].metadata as Record<string, unknown>
        assert.ok(metadata)
        assert.ok(metadata.model)
        assert.strictEqual(metadata.style, 'atmospheric')
        assert.strictEqual(metadata.terrain, 'open-plain')
        assert.ok(metadata.generatedAt)
        assert.ok(typeof metadata.tokensUsed === 'number')
        assert.ok(typeof metadata.cost === 'number')
    })

    test('multiple locations get separate base layers with correct scopeId', async () => {
        const container = await fixture.getContainer()
        const aiService = container.get<IAIDescriptionService>(TOKENS.AIDescriptionService)
        const layerRepo = await fixture.getLayerRepository()

        const locationId1 = crypto.randomUUID()
        const locationId2 = crypto.randomUUID()

        const request: BatchDescriptionRequest = {
            locations: [
                {
                    locationId: locationId1,
                    terrain: 'open-plain' as TerrainType,
                    arrivalDirection: 'north' as Direction,
                    neighbors: ['south'] as Direction[]
                },
                {
                    locationId: locationId2,
                    terrain: 'dense-forest' as TerrainType,
                    arrivalDirection: 'west' as Direction,
                    neighbors: ['east'] as Direction[]
                }
            ],
            style: 'concise'
        }

        await aiService.batchGenerateDescriptions(request)

        // Verify both locations have base layers with correct scopeId
        const layers1 = await layerRepo.queryLayerHistory(`loc:${locationId1}`, 'base')
        const layers2 = await layerRepo.queryLayerHistory(`loc:${locationId2}`, 'base')

        assert.strictEqual(layers1.length, 1)
        assert.strictEqual(layers2.length, 1)
        assert.strictEqual(layers1[0].scopeId, `loc:${locationId1}`)
        assert.strictEqual(layers2[0].scopeId, `loc:${locationId2}`)
    })
})
