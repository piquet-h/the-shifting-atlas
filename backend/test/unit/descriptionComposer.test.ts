/**
 * Unit tests for Description Composer Service
 *
 * Tests deterministic layer compilation, supersede masking, filtering, and ordering.
 */

import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { DescriptionLayer } from '@piquet-h/shared/types/layerRepository'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'
import type { ViewContext } from '../../src/services/types.js'

describe('Description Composer', () => {
    let fixture: UnitTestFixture

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('compileForLocation', () => {
        test('should return empty result when no layers exist', async () => {
            const composer = await fixture.getDescriptionComposer()
            const locationId = crypto.randomUUID()

            const context: ViewContext = {
                weather: 'clear',
                time: 'day',
                timestamp: new Date().toISOString()
            }

            const result = await composer.compileForLocation(locationId, context)

            assert.strictEqual(result.text, '')
            assert.strictEqual(result.html, '')
            assert.strictEqual(result.provenance.locationId, locationId)
            assert.strictEqual(result.provenance.layers.length, 0)
        })

        test('should compile base-only location', async () => {
            const composer = await fixture.getDescriptionComposer()
            const layerRepo = await fixture.getLayerRepository()
            const locationId = crypto.randomUUID()

            // Add base layer
            const baseLayer: DescriptionLayer = {
                id: crypto.randomUUID(),
                locationId,
                layerType: 'base',
                content: 'A grand hall with marble floors.',
                priority: 100,
                authoredAt: new Date().toISOString()
            }

            await layerRepo.addLayer(baseLayer)

            const context: ViewContext = {
                weather: 'clear',
                time: 'day',
                timestamp: new Date().toISOString()
            }

            const result = await composer.compileForLocation(locationId, context)

            assert.strictEqual(result.text, 'A grand hall with marble floors.')
            assert.ok(result.html.includes('marble floors'))
            // Base layers are not included in provenance.layers array (only non-base layers)
            assert.strictEqual(result.provenance.layers.length, 0)
        })

        test('should append structural layer after base', async () => {
            const composer = await fixture.getDescriptionComposer()
            const layerRepo = await fixture.getLayerRepository()
            const locationId = crypto.randomUUID()

            // Add base layer
            await layerRepo.addLayer({
                id: crypto.randomUUID(),
                locationId,
                layerType: 'base',
                content: 'A wooden palisade stands to the north.',
                priority: 100,
                authoredAt: new Date().toISOString()
            })

            // Add structural event layer (dynamic type)
            await layerRepo.addLayer({
                id: crypto.randomUUID(),
                locationId,
                layerType: 'dynamic',
                content: 'Charred stakes mark where fire consumed part of the wall.',
                priority: 50,
                authoredAt: new Date().toISOString()
            })

            const context: ViewContext = {
                timestamp: new Date().toISOString()
            }

            const result = await composer.compileForLocation(locationId, context)

            // Should have both base and structural layer
            assert.ok(result.text.includes('palisade'))
            assert.ok(result.text.includes('Charred stakes'))
            assert.strictEqual(result.provenance.layers.length, 1) // One non-base layer
        })

        test('should apply supersede masking when structural layer supersedes base', async () => {
            const composer = await fixture.getDescriptionComposer()
            const layerRepo = await fixture.getLayerRepository()
            const locationId = crypto.randomUUID()

            // Add base layer
            await layerRepo.addLayer({
                id: crypto.randomUUID(),
                locationId,
                layerType: 'base',
                content: 'A wooden palisade stands to the north. The road is hard-packed dirt.',
                priority: 100,
                authoredAt: new Date().toISOString()
            })

            // Add structural event with supersede
            await layerRepo.addLayer({
                id: crypto.randomUUID(),
                locationId,
                layerType: 'dynamic',
                content: 'The palisade has been destroyed by fire.',
                priority: 50,
                authoredAt: new Date().toISOString(),
                attributes: {
                    supersedes: ['A wooden palisade stands to the north']
                }
            })

            const context: ViewContext = {
                timestamp: new Date().toISOString()
            }

            const result = await composer.compileForLocation(locationId, context)

            // Base sentence should be hidden
            assert.ok(!result.text.includes('wooden palisade stands'))
            // Replacement should be present
            assert.ok(result.text.includes('destroyed by fire'))
            // Other base content should remain
            assert.ok(result.text.includes('hard-packed dirt'))
        })

        test('should filter ambient layers by weather context', async () => {
            const composer = await fixture.getDescriptionComposer()
            const layerRepo = await fixture.getLayerRepository()
            const locationId = crypto.randomUUID()

            // Add base
            await layerRepo.addLayer({
                id: crypto.randomUUID(),
                locationId,
                layerType: 'base',
                content: 'A forest clearing.',
                priority: 100,
                authoredAt: new Date().toISOString()
            })

            // Add rain ambient layer
            await layerRepo.addLayer({
                id: crypto.randomUUID(),
                locationId,
                layerType: 'ambient',
                content: 'Rain drips from the leaves.',
                priority: 50,
                authoredAt: new Date().toISOString(),
                attributes: {
                    weatherType: 'rain'
                }
            })

            // Add snow ambient layer
            await layerRepo.addLayer({
                id: crypto.randomUUID(),
                locationId,
                layerType: 'ambient',
                content: 'Snow blankets the ground.',
                priority: 50,
                authoredAt: new Date().toISOString(),
                attributes: {
                    weatherType: 'snow'
                }
            })

            // Compile with rain context
            const rainContext: ViewContext = {
                weather: 'rain',
                timestamp: new Date().toISOString()
            }

            const rainResult = await composer.compileForLocation(locationId, rainContext)

            assert.ok(rainResult.text.includes('Rain drips'))
            assert.ok(!rainResult.text.includes('Snow blankets'))

            // Compile with snow context
            const snowContext: ViewContext = {
                weather: 'snow',
                timestamp: new Date().toISOString()
            }

            const snowResult = await composer.compileForLocation(locationId, snowContext)

            assert.ok(!snowResult.text.includes('Rain drips'))
            assert.ok(snowResult.text.includes('Snow blankets'))
        })

        test('should filter ambient layers by time context', async () => {
            const composer = await fixture.getDescriptionComposer()
            const layerRepo = await fixture.getLayerRepository()
            const locationId = crypto.randomUUID()

            // Add base
            await layerRepo.addLayer({
                id: crypto.randomUUID(),
                locationId,
                layerType: 'base',
                content: 'A stone courtyard.',
                priority: 100,
                authoredAt: new Date().toISOString()
            })

            // Add day ambient layer
            await layerRepo.addLayer({
                id: crypto.randomUUID(),
                locationId,
                layerType: 'ambient',
                content: 'Sunlight warms the stones.',
                priority: 50,
                authoredAt: new Date().toISOString(),
                attributes: {
                    timeBucket: 'day'
                }
            })

            // Add night ambient layer
            await layerRepo.addLayer({
                id: crypto.randomUUID(),
                locationId,
                layerType: 'ambient',
                content: 'Stars glitter overhead.',
                priority: 50,
                authoredAt: new Date().toISOString(),
                attributes: {
                    timeBucket: 'night'
                }
            })

            // Compile with day context
            const dayContext: ViewContext = {
                time: 'day',
                timestamp: new Date().toISOString()
            }

            const dayResult = await composer.compileForLocation(locationId, dayContext)

            assert.ok(dayResult.text.includes('Sunlight'))
            assert.ok(!dayResult.text.includes('Stars'))

            // Compile with night context
            const nightContext: ViewContext = {
                time: 'night',
                timestamp: new Date().toISOString()
            }

            const nightResult = await composer.compileForLocation(locationId, nightContext)

            assert.ok(!nightResult.text.includes('Sunlight'))
            assert.ok(nightResult.text.includes('Stars'))
        })

        test('should maintain deterministic ordering with same priority', async () => {
            const composer = await fixture.getDescriptionComposer()
            const layerRepo = await fixture.getLayerRepository()
            const locationId = crypto.randomUUID()

            // Add base
            await layerRepo.addLayer({
                id: crypto.randomUUID(),
                locationId,
                layerType: 'base',
                content: 'Base text.',
                priority: 100,
                authoredAt: new Date().toISOString()
            })

            // Add multiple ambient layers with same priority but different IDs
            await layerRepo.addLayer({
                id: 'zzz-layer',
                locationId,
                layerType: 'ambient',
                content: 'Z content.',
                priority: 50,
                authoredAt: new Date().toISOString()
            })

            await layerRepo.addLayer({
                id: 'aaa-layer',
                locationId,
                layerType: 'ambient',
                content: 'A content.',
                priority: 50,
                authoredAt: new Date().toISOString()
            })

            const context: ViewContext = {
                timestamp: new Date().toISOString()
            }

            // Compile multiple times to verify determinism
            const result1 = await composer.compileForLocation(locationId, context)
            const result2 = await composer.compileForLocation(locationId, context)

            assert.strictEqual(result1.text, result2.text)
            assert.strictEqual(result1.provenance.layers[0].id, 'aaa-layer') // Alphabetically first
            assert.strictEqual(result1.provenance.layers[1].id, 'zzz-layer')
        })

        test('should handle all supersedes matched (empty base)', async () => {
            const composer = await fixture.getDescriptionComposer()
            const layerRepo = await fixture.getLayerRepository()
            const locationId = crypto.randomUUID()

            // Add base with single sentence
            await layerRepo.addLayer({
                id: crypto.randomUUID(),
                locationId,
                layerType: 'base',
                content: 'An old wooden gate.',
                priority: 100,
                authoredAt: new Date().toISOString()
            })

            // Add structural layer that supersedes the entire base
            await layerRepo.addLayer({
                id: crypto.randomUUID(),
                locationId,
                layerType: 'dynamic',
                content: 'The gate has been replaced with iron.',
                priority: 50,
                authoredAt: new Date().toISOString(),
                attributes: {
                    supersedes: ['An old wooden gate']
                }
            })

            const context: ViewContext = {
                timestamp: new Date().toISOString()
            }

            const result = await composer.compileForLocation(locationId, context)

            // Base should be completely masked
            assert.ok(!result.text.includes('old wooden'))
            // Replacement should be present
            assert.ok(result.text.includes('replaced with iron'))
        })

        test('should assemble layers in correct order: base → dynamic → ambient', async () => {
            const composer = await fixture.getDescriptionComposer()
            const layerRepo = await fixture.getLayerRepository()
            const locationId = crypto.randomUUID()

            // Add layers in random order
            await layerRepo.addLayer({
                id: crypto.randomUUID(),
                locationId,
                layerType: 'ambient',
                content: 'Ambient layer.',
                priority: 50,
                authoredAt: new Date().toISOString()
            })

            await layerRepo.addLayer({
                id: crypto.randomUUID(),
                locationId,
                layerType: 'base',
                content: 'Base layer.',
                priority: 100,
                authoredAt: new Date().toISOString()
            })

            await layerRepo.addLayer({
                id: crypto.randomUUID(),
                locationId,
                layerType: 'dynamic',
                content: 'Dynamic layer.',
                priority: 75,
                authoredAt: new Date().toISOString()
            })

            const context: ViewContext = {
                timestamp: new Date().toISOString()
            }

            const result = await composer.compileForLocation(locationId, context)

            // Verify order by text position
            const baseIndex = result.text.indexOf('Base layer')
            const dynamicIndex = result.text.indexOf('Dynamic layer')
            const ambientIndex = result.text.indexOf('Ambient layer')

            assert.ok(baseIndex < dynamicIndex, 'Base should come before dynamic')
            assert.ok(dynamicIndex < ambientIndex, 'Dynamic should come before ambient')
        })

        test('should convert markdown to HTML', async () => {
            const composer = await fixture.getDescriptionComposer()
            const layerRepo = await fixture.getLayerRepository()
            const locationId = crypto.randomUUID()

            // Add base with markdown
            await layerRepo.addLayer({
                id: crypto.randomUUID(),
                locationId,
                layerType: 'base',
                content: '**Bold text** and *italic text*.',
                priority: 100,
                authoredAt: new Date().toISOString()
            })

            const context: ViewContext = {
                timestamp: new Date().toISOString()
            }

            const result = await composer.compileForLocation(locationId, context)

            // Text should be plain markdown
            assert.ok(result.text.includes('**Bold text**'))

            // HTML should have converted tags
            assert.ok(result.html.includes('<strong>Bold text</strong>'))
            assert.ok(result.html.includes('<em>italic text</em>'))
        })

        test('should include provenance metadata', async () => {
            const composer = await fixture.getDescriptionComposer()
            const layerRepo = await fixture.getLayerRepository()
            const locationId = crypto.randomUUID()

            const layerId = crypto.randomUUID()
            const authoredAt = new Date().toISOString()

            await layerRepo.addLayer({
                id: crypto.randomUUID(),
                locationId,
                layerType: 'base',
                content: 'Base.',
                priority: 100,
                authoredAt
            })

            await layerRepo.addLayer({
                id: layerId,
                locationId,
                layerType: 'dynamic',
                content: 'Dynamic.',
                priority: 50,
                authoredAt
            })

            const context: ViewContext = {
                weather: 'clear',
                timestamp: new Date().toISOString()
            }

            const result = await composer.compileForLocation(locationId, context)

            assert.strictEqual(result.provenance.locationId, locationId)
            assert.strictEqual(result.provenance.context.weather, 'clear')
            assert.ok(result.provenance.compiledAt)
            assert.strictEqual(result.provenance.layers.length, 1)
            assert.strictEqual(result.provenance.layers[0].id, layerId)
            assert.strictEqual(result.provenance.layers[0].layerType, 'dynamic')
        })
    })
})
