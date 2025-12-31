/**
 * Integration tests for Layer Repository
 * Tests repository operations with dependency injection container
 */

import type { DescriptionLayer } from '@piquet-h/shared/types/layerRepository'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describe('Layer Repository Integration', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('Add Layer', () => {
        test('should add layer to location', async () => {
            const repo = await fixture.getLayerRepository()
            const locationId = crypto.randomUUID()

            const layer: DescriptionLayer = {
                id: crypto.randomUUID(),
                locationId,
                layerType: 'base',
                content: 'A grand entrance hall with marble floors.',
                priority: 100,
                authoredAt: new Date().toISOString()
            }

            const result = await repo.addLayer(layer)

            assert.ok(result)
            assert.strictEqual(result.id, layer.id)
            assert.strictEqual(result.locationId, locationId)
            assert.strictEqual(result.layerType, 'base')
            assert.strictEqual(result.content, 'A grand entrance hall with marble floors.')
            assert.strictEqual(result.priority, 100)
        })

        test('should handle concurrent adds for same location', async () => {
            const repo = await fixture.getLayerRepository()
            const locationId = crypto.randomUUID()

            const layer1: DescriptionLayer = {
                id: crypto.randomUUID(),
                locationId,
                layerType: 'base',
                content: 'Base description',
                priority: 100,
                authoredAt: new Date().toISOString()
            }

            const layer2: DescriptionLayer = {
                id: crypto.randomUUID(),
                locationId,
                layerType: 'ambient',
                content: 'Ambient sounds fill the air',
                priority: 50,
                authoredAt: new Date().toISOString()
            }

            await Promise.all([repo.addLayer(layer1), repo.addLayer(layer2)])

            const layers = await repo.getLayersForLocation(locationId)
            assert.strictEqual(layers.length, 2)
        })

        test('should handle different layer types', async () => {
            const repo = await fixture.getLayerRepository()
            const locationId = crypto.randomUUID()

            const baseLayer: DescriptionLayer = {
                id: crypto.randomUUID(),
                locationId,
                layerType: 'base',
                content: 'Base layer content',
                priority: 100,
                authoredAt: new Date().toISOString()
            }

            const ambientLayer: DescriptionLayer = {
                id: crypto.randomUUID(),
                locationId,
                layerType: 'ambient',
                content: 'Ambient layer content',
                priority: 50,
                authoredAt: new Date().toISOString()
            }

            const dynamicLayer: DescriptionLayer = {
                id: crypto.randomUUID(),
                locationId,
                layerType: 'dynamic',
                content: 'Dynamic layer content',
                priority: 75,
                authoredAt: new Date().toISOString()
            }

            await repo.addLayer(baseLayer)
            await repo.addLayer(ambientLayer)
            await repo.addLayer(dynamicLayer)

            const layers = await repo.getLayersForLocation(locationId)
            assert.strictEqual(layers.length, 3)
        })
    })

    describe('Get Layers For Location', () => {
        test('should retrieve all layers for location (single-partition query)', async () => {
            const repo = await fixture.getLayerRepository()
            const locationId = crypto.randomUUID()

            const layers: DescriptionLayer[] = [
                {
                    id: crypto.randomUUID(),
                    locationId,
                    layerType: 'base',
                    content: 'Base description',
                    priority: 100,
                    authoredAt: new Date().toISOString()
                },
                {
                    id: crypto.randomUUID(),
                    locationId,
                    layerType: 'ambient',
                    content: 'Ambient details',
                    priority: 50,
                    authoredAt: new Date().toISOString()
                },
                {
                    id: crypto.randomUUID(),
                    locationId,
                    layerType: 'dynamic',
                    content: 'Dynamic events',
                    priority: 75,
                    authoredAt: new Date().toISOString()
                }
            ]

            for (const layer of layers) {
                await repo.addLayer(layer)
            }

            const retrieved = await repo.getLayersForLocation(locationId)

            assert.strictEqual(retrieved.length, 3)
            // Verify priority ordering: 100 (base) > 75 (dynamic) > 50 (ambient)
            assert.strictEqual(retrieved[0].priority, 100)
            assert.strictEqual(retrieved[1].priority, 75)
            assert.strictEqual(retrieved[2].priority, 50)
        })

        test('should return empty array when location has no layers', async () => {
            const repo = await fixture.getLayerRepository()
            const locationId = crypto.randomUUID()

            const layers = await repo.getLayersForLocation(locationId)

            assert.ok(Array.isArray(layers))
            assert.strictEqual(layers.length, 0)
        })

        test('should only query single partition for location layers', async () => {
            const repo = await fixture.getLayerRepository()
            const location1 = crypto.randomUUID()
            const location2 = crypto.randomUUID()

            // Add layers for location 1
            await repo.addLayer({
                id: crypto.randomUUID(),
                locationId: location1,
                layerType: 'base',
                content: 'Location 1 base',
                priority: 100,
                authoredAt: new Date().toISOString()
            })

            // Add layers for location 2
            await repo.addLayer({
                id: crypto.randomUUID(),
                locationId: location2,
                layerType: 'base',
                content: 'Location 2 base',
                priority: 100,
                authoredAt: new Date().toISOString()
            })

            const location1Layers = await repo.getLayersForLocation(location1)
            const location2Layers = await repo.getLayersForLocation(location2)

            // Each query should only return layers from single partition
            assert.strictEqual(location1Layers.length, 1)
            assert.strictEqual(location1Layers[0].content, 'Location 1 base')

            assert.strictEqual(location2Layers.length, 1)
            assert.strictEqual(location2Layers[0].content, 'Location 2 base')
        })

        test('should handle priority ties with deterministic ordering by layerId', async () => {
            const repo = await fixture.getLayerRepository()
            const locationId = crypto.randomUUID()

            // Create layers with same priority but different IDs
            const layerA: DescriptionLayer = {
                id: 'aaaa-layer-id',
                locationId,
                layerType: 'ambient',
                content: 'Layer A',
                priority: 50,
                authoredAt: new Date().toISOString()
            }

            const layerZ: DescriptionLayer = {
                id: 'zzzz-layer-id',
                locationId,
                layerType: 'ambient',
                content: 'Layer Z',
                priority: 50,
                authoredAt: new Date().toISOString()
            }

            // Add in reverse order to ensure sorting is deterministic
            await repo.addLayer(layerZ)
            await repo.addLayer(layerA)

            const layers = await repo.getLayersForLocation(locationId)

            // Should be sorted by layerId when priority is equal
            assert.strictEqual(layers.length, 2)
            assert.strictEqual(layers[0].id, 'aaaa-layer-id')
            assert.strictEqual(layers[1].id, 'zzzz-layer-id')
        })
    })

    describe('Update Layer', () => {
        test('should update layer content', async () => {
            const repo = await fixture.getLayerRepository()
            const locationId = crypto.randomUUID()

            const layer: DescriptionLayer = {
                id: crypto.randomUUID(),
                locationId,
                layerType: 'dynamic',
                content: 'Original content',
                priority: 50,
                authoredAt: new Date().toISOString()
            }

            await repo.addLayer(layer)

            const updated = await repo.updateLayer(layer.id, `loc:${locationId}`, {
                content: 'Updated content'
            })

            assert.ok(updated)
            assert.strictEqual(updated.content, 'Updated content')
            assert.strictEqual(updated.priority, 50) // Unchanged
        })

        test('should update layer priority', async () => {
            const repo = await fixture.getLayerRepository()
            const locationId = crypto.randomUUID()

            const layer: DescriptionLayer = {
                id: crypto.randomUUID(),
                locationId,
                layerType: 'ambient',
                content: 'Ambient content',
                priority: 50,
                authoredAt: new Date().toISOString()
            }

            await repo.addLayer(layer)

            const updated = await repo.updateLayer(layer.id, `loc:${locationId}`, {
                priority: 75
            })

            assert.ok(updated)
            assert.strictEqual(updated.priority, 75)
            assert.strictEqual(updated.content, 'Ambient content') // Unchanged
        })

        test('should update layer type', async () => {
            const repo = await fixture.getLayerRepository()
            const locationId = crypto.randomUUID()

            const layer: DescriptionLayer = {
                id: crypto.randomUUID(),
                locationId,
                layerType: 'ambient',
                content: 'Content',
                priority: 50,
                authoredAt: new Date().toISOString()
            }

            await repo.addLayer(layer)

            const updated = await repo.updateLayer(layer.id, `loc:${locationId}`, {
                layerType: 'dynamic'
            })

            assert.ok(updated)
            assert.strictEqual(updated.layerType, 'dynamic')
        })

        test('should return null for non-existent layer', async () => {
            const repo = await fixture.getLayerRepository()
            const locationId = crypto.randomUUID()

            const updated = await repo.updateLayer('nonexistent-id', `loc:${locationId}`, {
                content: 'Updated content'
            })

            assert.strictEqual(updated, null)
        })

        test('should return null when locationId mismatch', async () => {
            const repo = await fixture.getLayerRepository()
            const locationId1 = crypto.randomUUID()
            const locationId2 = crypto.randomUUID()

            const layer: DescriptionLayer = {
                id: crypto.randomUUID(),
                locationId: locationId1,
                layerType: 'base',
                content: 'Original content',
                priority: 100,
                authoredAt: new Date().toISOString()
            }

            await repo.addLayer(layer)

            // Try to update with wrong locationId
            const updated = await repo.updateLayer(layer.id, locationId2, {
                content: 'Updated content'
            })

            assert.strictEqual(updated, null)
        })
    })

    describe('Delete Layer', () => {
        test('should delete layer from location', async () => {
            const repo = await fixture.getLayerRepository()
            const locationId = crypto.randomUUID()

            const layer: DescriptionLayer = {
                id: crypto.randomUUID(),
                locationId,
                layerType: 'dynamic',
                content: 'Temporary content',
                priority: 50,
                authoredAt: new Date().toISOString()
            }

            await repo.addLayer(layer)

            const deleted = await repo.deleteLayer(layer.id, `loc:${locationId}`)
            assert.strictEqual(deleted, true)

            const layers = await repo.getLayersForLocation(locationId)
            assert.strictEqual(layers.length, 0)
        })

        test('should return false for non-existent layer', async () => {
            const repo = await fixture.getLayerRepository()
            const locationId = crypto.randomUUID()

            const deleted = await repo.deleteLayer('nonexistent-id', `loc:${locationId}`)
            assert.strictEqual(deleted, false)
        })

        test('should return false when locationId mismatch', async () => {
            const repo = await fixture.getLayerRepository()
            const locationId1 = crypto.randomUUID()
            const locationId2 = crypto.randomUUID()

            const layer: DescriptionLayer = {
                id: crypto.randomUUID(),
                locationId: locationId1,
                layerType: 'base',
                content: 'Content',
                priority: 100,
                authoredAt: new Date().toISOString()
            }

            await repo.addLayer(layer)

            // Try to delete with wrong locationId
            const deleted = await repo.deleteLayer(layer.id, locationId2)
            assert.strictEqual(deleted, false)

            // Verify layer still exists
            const layers = await repo.getLayersForLocation(locationId1)
            assert.strictEqual(layers.length, 1)
        })
    })

    describe('Edge Cases', () => {
        test('should handle layer content exceeds 100KB (log warning, allow)', async () => {
            const repo = await fixture.getLayerRepository()
            const locationId = crypto.randomUUID()

            // Create content that exceeds 100KB
            const largeContent = 'x'.repeat(101000)

            const layer: DescriptionLayer = {
                id: crypto.randomUUID(),
                locationId,
                layerType: 'base',
                content: largeContent,
                priority: 100,
                authoredAt: new Date().toISOString()
            }

            // Should succeed with warning (implementation logs but allows)
            const result = await repo.addLayer(layer)

            assert.ok(result)
            assert.strictEqual(result.content.length, largeContent.length)
        })

        test('should handle location with many layers (no capacity limit)', async () => {
            const repo = await fixture.getLayerRepository()
            const locationId = crypto.randomUUID()
            const layerCount = 20

            // Add many layers
            for (let i = 0; i < layerCount; i++) {
                await repo.addLayer({
                    id: crypto.randomUUID(),
                    locationId,
                    layerType: 'ambient',
                    content: `Layer ${i} content`,
                    priority: i,
                    authoredAt: new Date().toISOString()
                })
            }

            const layers = await repo.getLayersForLocation(locationId)

            // No capacity limit for MVP
            assert.strictEqual(layers.length, layerCount)
        })

        test('should handle update with large content (log warning, allow)', async () => {
            const repo = await fixture.getLayerRepository()
            const locationId = crypto.randomUUID()

            const layer: DescriptionLayer = {
                id: crypto.randomUUID(),
                locationId,
                layerType: 'dynamic',
                content: 'Original content',
                priority: 50,
                authoredAt: new Date().toISOString()
            }

            await repo.addLayer(layer)

            // Update with large content
            const largeContent = 'y'.repeat(101000)
            const updated = await repo.updateLayer(layer.id, `loc:${locationId}`, {
                content: largeContent
            })

            assert.ok(updated)
            assert.strictEqual(updated.content.length, largeContent.length)
        })
    })

    describe('Complex Priority Ordering', () => {
        test('should maintain correct ordering with mixed priorities', async () => {
            const repo = await fixture.getLayerRepository()
            const locationId = crypto.randomUUID()

            const layers: DescriptionLayer[] = [
                {
                    id: 'layer-5',
                    locationId,
                    layerType: 'ambient',
                    content: 'Priority 50',
                    priority: 50,
                    authoredAt: new Date().toISOString()
                },
                {
                    id: 'layer-1',
                    locationId,
                    layerType: 'base',
                    content: 'Priority 100',
                    priority: 100,
                    authoredAt: new Date().toISOString()
                },
                {
                    id: 'layer-7',
                    locationId,
                    layerType: 'dynamic',
                    content: 'Priority 75',
                    priority: 75,
                    authoredAt: new Date().toISOString()
                },
                {
                    id: 'layer-2',
                    locationId,
                    layerType: 'ambient',
                    content: 'Priority 25',
                    priority: 25,
                    authoredAt: new Date().toISOString()
                }
            ]

            // Add in random order
            await repo.addLayer(layers[2])
            await repo.addLayer(layers[0])
            await repo.addLayer(layers[3])
            await repo.addLayer(layers[1])

            const retrieved = await repo.getLayersForLocation(locationId)

            // Should be sorted by priority descending
            assert.strictEqual(retrieved.length, 4)
            assert.strictEqual(retrieved[0].priority, 100)
            assert.strictEqual(retrieved[1].priority, 75)
            assert.strictEqual(retrieved[2].priority, 50)
            assert.strictEqual(retrieved[3].priority, 25)
        })
    })
})
