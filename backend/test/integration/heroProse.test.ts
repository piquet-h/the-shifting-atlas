/**
 * Integration tests for Hero-Prose Layer Convention in DescriptionComposer
 *
 * Tests compilation behavior when hero-prose layers are present.
 * Hero-prose layers replace base description instead of appending.
 *
 * See: docs/architecture/hero-prose-layer-convention.md
 */

import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { ViewContext } from '../../src/services/types.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describe('Hero-Prose Integration Tests', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('should use hero-prose instead of base description', async () => {
        const composer = await fixture.getDescriptionComposer()
        const layerRepo = await fixture.getLayerRepository()
        const locationId = crypto.randomUUID()

        const baseDescription = 'A plain wooden gate.'
        const heroProse = 'The ancient oak gate stands weathered but resolute, its iron hinges showing the passage of countless seasons.'

        // Add hero-prose layer
        await layerRepo.addLayer({
            id: crypto.randomUUID(),
            locationId,
            scopeId: `loc:${locationId}`,
            layerType: 'dynamic',
            value: heroProse,
            effectiveFromTick: 0,
            effectiveToTick: null,
            priority: 100,
            authoredAt: new Date().toISOString(),
            metadata: {
                replacesBase: true,
                role: 'hero',
                promptHash: 'test-prompt-v1'
            }
        })

        const context: ViewContext = {
            timestamp: new Date().toISOString()
        }

        const result = await composer.compileForLocation(locationId, context, { baseDescription })

        // Should use hero-prose, not base
        assert.ok(result.text.includes('ancient oak gate'))
        assert.ok(result.text.includes('weathered but resolute'))
        assert.ok(!result.text.includes('plain wooden gate'))

        // Provenance should include hero layer
        assert.strictEqual(result.provenance.layers.length, 1)
    })

    test('should fall back to base when no hero-prose exists', async () => {
        const composer = await fixture.getDescriptionComposer()
        const locationId = crypto.randomUUID()

        const baseDescription = 'A plain wooden gate.'

        const context: ViewContext = {
            timestamp: new Date().toISOString()
        }

        const result = await composer.compileForLocation(locationId, context, { baseDescription })

        // Should use base description
        assert.ok(result.text.includes('plain wooden gate'))
        assert.strictEqual(result.provenance.layers.length, 0)
    })

    test('should fall back to base when hero-prose content is empty', async () => {
        const composer = await fixture.getDescriptionComposer()
        const layerRepo = await fixture.getLayerRepository()
        const locationId = crypto.randomUUID()

        const baseDescription = 'A plain wooden gate.'

        // Add hero-prose layer with empty content
        await layerRepo.addLayer({
            id: crypto.randomUUID(),
            locationId,
            scopeId: `loc:${locationId}`,
            layerType: 'dynamic',
            value: '', // Empty!
            effectiveFromTick: 0,
            effectiveToTick: null,
            priority: 100,
            authoredAt: new Date().toISOString(),
            metadata: {
                replacesBase: true,
                role: 'hero',
                promptHash: 'test-prompt-v1'
            }
        })

        const context: ViewContext = {
            timestamp: new Date().toISOString()
        }

        const result = await composer.compileForLocation(locationId, context, { baseDescription })

        // Should fall back to base
        assert.ok(result.text.includes('plain wooden gate'))
    })

    test('should fall back to base when hero-prose content is whitespace-only', async () => {
        const composer = await fixture.getDescriptionComposer()
        const layerRepo = await fixture.getLayerRepository()
        const locationId = crypto.randomUUID()

        const baseDescription = 'A plain wooden gate.'

        // Add hero-prose layer with whitespace-only content
        await layerRepo.addLayer({
            id: crypto.randomUUID(),
            locationId,
            scopeId: `loc:${locationId}`,
            layerType: 'dynamic',
            value: '   \n\t  ', // Whitespace only!
            effectiveFromTick: 0,
            effectiveToTick: null,
            priority: 100,
            authoredAt: new Date().toISOString(),
            metadata: {
                replacesBase: true,
                role: 'hero',
                promptHash: 'test-prompt-v1'
            }
        })

        const context: ViewContext = {
            timestamp: new Date().toISOString()
        }

        const result = await composer.compileForLocation(locationId, context, { baseDescription })

        // Should fall back to base
        assert.ok(result.text.includes('plain wooden gate'))
    })

    test('should apply other layers on top of hero-prose', async () => {
        const composer = await fixture.getDescriptionComposer()
        const layerRepo = await fixture.getLayerRepository()
        const locationId = crypto.randomUUID()

        const baseDescription = 'A plain wooden gate.'
        const heroProse = 'The ancient oak gate stands weathered but resolute.'

        // Add hero-prose layer
        await layerRepo.addLayer({
            id: crypto.randomUUID(),
            locationId,
            scopeId: `loc:${locationId}`,
            layerType: 'dynamic',
            value: heroProse,
            effectiveFromTick: 0,
            effectiveToTick: null,
            priority: 100,
            authoredAt: new Date().toISOString(),
            metadata: {
                replacesBase: true,
                role: 'hero',
                promptHash: 'test-prompt-v1'
            }
        })

        // Add ambient layer (should apply on top of hero-prose)
        await layerRepo.addLayer({
            id: crypto.randomUUID(),
            locationId,
            scopeId: `loc:${locationId}`,
            layerType: 'ambient',
            value: 'Rain drips from the weathered wood.',
            effectiveFromTick: 0,
            effectiveToTick: null,
            priority: 50,
            authoredAt: new Date().toISOString(),
            attributes: {
                weatherType: 'rain'
            }
        })

        const context: ViewContext = {
            weather: 'rain',
            timestamp: new Date().toISOString()
        }

        const result = await composer.compileForLocation(locationId, context, { baseDescription })

        // Should have hero-prose
        assert.ok(result.text.includes('ancient oak gate'))
        // Should have ambient layer on top
        assert.ok(result.text.includes('Rain drips'))
        // Should NOT have base
        assert.ok(!result.text.includes('plain wooden gate'))

        // Should have 2 layers in provenance (hero-prose + ambient)
        assert.strictEqual(result.provenance.layers.length, 2)
    })

    test('should select most recent hero-prose when multiple exist', async () => {
        const composer = await fixture.getDescriptionComposer()
        const layerRepo = await fixture.getLayerRepository()
        const locationId = crypto.randomUUID()

        const baseDescription = 'A plain wooden gate.'

        // Add older hero-prose layer
        await layerRepo.addLayer({
            id: crypto.randomUUID(),
            locationId,
            scopeId: `loc:${locationId}`,
            layerType: 'dynamic',
            value: 'Old version of hero prose.',
            effectiveFromTick: 0,
            effectiveToTick: null,
            priority: 100,
            authoredAt: '2026-01-10T10:00:00Z',
            metadata: {
                replacesBase: true,
                role: 'hero',
                promptHash: 'test-prompt-v1'
            }
        })

        // Add newer hero-prose layer
        await layerRepo.addLayer({
            id: crypto.randomUUID(),
            locationId,
            scopeId: `loc:${locationId}`,
            layerType: 'dynamic',
            value: 'New version of hero prose with improved phrasing.',
            effectiveFromTick: 0,
            effectiveToTick: null,
            priority: 100,
            authoredAt: '2026-01-15T10:00:00Z',
            metadata: {
                replacesBase: true,
                role: 'hero',
                promptHash: 'test-prompt-v2'
            }
        })

        const context: ViewContext = {
            timestamp: new Date().toISOString()
        }

        const result = await composer.compileForLocation(locationId, context, { baseDescription })

        // Should use newer hero-prose
        assert.ok(result.text.includes('New version'))
        assert.ok(result.text.includes('improved phrasing'))
        assert.ok(!result.text.includes('Old version'))
    })

    test('should apply supersede masking to hero-prose (not base)', async () => {
        const composer = await fixture.getDescriptionComposer()
        const layerRepo = await fixture.getLayerRepository()
        const locationId = crypto.randomUUID()

        const baseDescription = 'A plain wooden gate stands at the entrance.'
        const heroProse = 'The ancient oak gate stands weathered but resolute. Iron hinges gleam in the sunlight.'

        // Add hero-prose layer
        await layerRepo.addLayer({
            id: crypto.randomUUID(),
            locationId,
            scopeId: `loc:${locationId}`,
            layerType: 'dynamic',
            value: heroProse,
            effectiveFromTick: 0,
            effectiveToTick: null,
            priority: 100,
            authoredAt: new Date().toISOString(),
            metadata: {
                replacesBase: true,
                role: 'hero',
                promptHash: 'test-prompt-v1'
            }
        })

        // Add structural event that supersedes part of hero-prose
        await layerRepo.addLayer({
            id: crypto.randomUUID(),
            locationId,
            scopeId: `loc:${locationId}`,
            layerType: 'dynamic',
            value: 'The gate has been destroyed by fire.',
            effectiveFromTick: 0,
            effectiveToTick: null,
            priority: 75,
            authoredAt: new Date().toISOString(),
            attributes: {
                supersedes: ['The ancient oak gate stands weathered but resolute']
            }
        })

        const context: ViewContext = {
            timestamp: new Date().toISOString()
        }

        const result = await composer.compileForLocation(locationId, context, { baseDescription })

        // Hero-prose sentence should be superseded
        assert.ok(!result.text.includes('ancient oak gate stands'))
        // Remaining hero-prose should be present
        assert.ok(result.text.includes('Iron hinges'))
        // Structural event should be present
        assert.ok(result.text.includes('destroyed by fire'))
        // Base should NOT be present (hero-prose replaced it)
        assert.ok(!result.text.includes('plain wooden gate'))
    })

    test('should ignore non-hero dynamic layers when selecting hero-prose', async () => {
        const composer = await fixture.getDescriptionComposer()
        const layerRepo = await fixture.getLayerRepository()
        const locationId = crypto.randomUUID()

        const baseDescription = 'A plain wooden gate.'
        const heroProse = 'The ancient oak gate stands weathered but resolute.'

        // Add regular structural layer (dynamic but NOT hero-prose)
        await layerRepo.addLayer({
            id: crypto.randomUUID(),
            locationId,
            scopeId: `loc:${locationId}`,
            layerType: 'dynamic',
            value: 'A banner hangs from the gate.',
            effectiveFromTick: 0,
            effectiveToTick: null,
            priority: 100,
            authoredAt: new Date().toISOString()
            // No metadata.replacesBase or metadata.role='hero'
        })

        // Add hero-prose layer
        await layerRepo.addLayer({
            id: crypto.randomUUID(),
            locationId,
            scopeId: `loc:${locationId}`,
            layerType: 'dynamic',
            value: heroProse,
            effectiveFromTick: 0,
            effectiveToTick: null,
            priority: 100,
            authoredAt: new Date().toISOString(),
            metadata: {
                replacesBase: true,
                role: 'hero',
                promptHash: 'test-prompt-v1'
            }
        })

        const context: ViewContext = {
            timestamp: new Date().toISOString()
        }

        const result = await composer.compileForLocation(locationId, context, { baseDescription })

        // Should use hero-prose as base
        assert.ok(result.text.includes('ancient oak gate'))
        // Regular structural layer should be applied on top
        assert.ok(result.text.includes('banner hangs'))
        // Original base should NOT be present
        assert.ok(!result.text.includes('plain wooden gate'))
    })
})
