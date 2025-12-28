/**
 * Unit tests for layer repository scope inheritance interface contracts.
 * Tests the new realm-based layer resolution without implementation details.
 */

import assert from 'node:assert'
import { describe, test, beforeEach, afterEach } from 'node:test'
import type { DescriptionLayer, LayerType } from '@piquet-h/shared/types/layerRepository'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'

describe('Layer Repository Scope Inheritance (Unit)', () => {
    let fixture: UnitTestFixture

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('Scope ID Patterns', () => {
        test('location scope pattern should be loc:<locationId>', () => {
            const locationId = crypto.randomUUID()
            const expectedScopeId = `loc:${locationId}`
            assert.strictEqual(expectedScopeId.startsWith('loc:'), true)
            assert.strictEqual(expectedScopeId.includes(locationId), true)
        })

        test('realm scope pattern should be realm:<realmId>', () => {
            const realmId = crypto.randomUUID()
            const expectedScopeId = `realm:${realmId}`
            assert.strictEqual(expectedScopeId.startsWith('realm:'), true)
            assert.strictEqual(expectedScopeId.includes(realmId), true)
        })
    })

    describe('DescriptionLayer Interface', () => {
        test('should support new temporal fields', () => {
            const layer: DescriptionLayer = {
                id: crypto.randomUUID(),
                scopeId: `loc:${crypto.randomUUID()}`,
                layerType: 'weather',
                value: 'Heavy rain falls from dark clouds.',
                effectiveFromTick: 1000,
                effectiveToTick: 2000,
                authoredAt: new Date().toISOString()
            }

            assert.ok(layer.id)
            assert.ok(layer.scopeId)
            assert.strictEqual(layer.layerType, 'weather')
            assert.strictEqual(layer.value, 'Heavy rain falls from dark clouds.')
            assert.strictEqual(layer.effectiveFromTick, 1000)
            assert.strictEqual(layer.effectiveToTick, 2000)
        })

        test('should support indefinite layers (effectiveToTick: null)', () => {
            const layer: DescriptionLayer = {
                id: crypto.randomUUID(),
                scopeId: `realm:${crypto.randomUUID()}`,
                layerType: 'base',
                value: 'An ancient forest stretches in all directions.',
                effectiveFromTick: 0,
                effectiveToTick: null, // Indefinite
                authoredAt: new Date().toISOString()
            }

            assert.strictEqual(layer.effectiveToTick, null)
        })

        test('should support new layer types (weather, lighting)', () => {
            const weatherLayer: DescriptionLayer = {
                id: crypto.randomUUID(),
                scopeId: `realm:${crypto.randomUUID()}`,
                layerType: 'weather',
                value: 'Mist rolls across the landscape.',
                effectiveFromTick: 0,
                effectiveToTick: null,
                authoredAt: new Date().toISOString()
            }

            const lightingLayer: DescriptionLayer = {
                id: crypto.randomUUID(),
                scopeId: `loc:${crypto.randomUUID()}`,
                layerType: 'lighting',
                value: 'Soft moonlight illuminates the path.',
                effectiveFromTick: 0,
                effectiveToTick: null,
                authoredAt: new Date().toISOString()
            }

            assert.strictEqual(weatherLayer.layerType, 'weather')
            assert.strictEqual(lightingLayer.layerType, 'lighting')
        })

        test('should support optional metadata', () => {
            const layer: DescriptionLayer = {
                id: crypto.randomUUID(),
                scopeId: `realm:${crypto.randomUUID()}`,
                layerType: 'weather',
                value: 'Storm clouds gather overhead.',
                effectiveFromTick: 1000,
                effectiveToTick: 1500,
                authoredAt: new Date().toISOString(),
                metadata: {
                    intensity: 'severe',
                    windSpeed: 45,
                    visibility: 'low'
                }
            }

            assert.ok(layer.metadata)
            assert.strictEqual(layer.metadata.intensity, 'severe')
            assert.strictEqual(layer.metadata.windSpeed, 45)
        })
    })

    describe('Temporal Validity Logic', () => {
        test('layer active when tick is within [fromTick, toTick] range', () => {
            const layer: DescriptionLayer = {
                id: crypto.randomUUID(),
                scopeId: `loc:${crypto.randomUUID()}`,
                layerType: 'weather',
                value: 'Rain falls steadily.',
                effectiveFromTick: 1000,
                effectiveToTick: 2000,
                authoredAt: new Date().toISOString()
            }

            // Test boundary conditions
            const isActive = (tick: number) => {
                return (
                    tick >= layer.effectiveFromTick && (layer.effectiveToTick === null || tick <= layer.effectiveToTick)
                )
            }

            assert.strictEqual(isActive(999), false) // Before range
            assert.strictEqual(isActive(1000), true) // Start boundary
            assert.strictEqual(isActive(1500), true) // Within range
            assert.strictEqual(isActive(2000), true) // End boundary
            assert.strictEqual(isActive(2001), false) // After range
        })

        test('indefinite layer (toTick: null) should always be active from fromTick onwards', () => {
            const layer: DescriptionLayer = {
                id: crypto.randomUUID(),
                scopeId: `realm:${crypto.randomUUID()}`,
                layerType: 'base',
                value: 'Ancient trees tower overhead.',
                effectiveFromTick: 100,
                effectiveToTick: null,
                authoredAt: new Date().toISOString()
            }

            const isActive = (tick: number) => {
                return (
                    tick >= layer.effectiveFromTick && (layer.effectiveToTick === null || tick <= layer.effectiveToTick)
                )
            }

            assert.strictEqual(isActive(99), false)
            assert.strictEqual(isActive(100), true)
            assert.strictEqual(isActive(1000), true)
            assert.strictEqual(isActive(999999), true)
        })
    })

    describe('ILayerRepository Interface Contract', () => {
        test('getActiveLayerForLocation should accept locationId, layerType, tick', async () => {
            const repo = await fixture.getLayerRepository()

            // Interface contract test - method signature validation
            const result = await repo.getActiveLayerForLocation(crypto.randomUUID(), 'weather', 1000)

            // Should return null when no layers exist
            assert.strictEqual(result, null)
        })

        test('setLayerForRealm should create realm-scoped layer', async () => {
            const repo = await fixture.getLayerRepository()
            const realmId = crypto.randomUUID()

            const layer = await repo.setLayerForRealm(realmId, 'weather', 1000, 2000, 'Fog blankets the realm.')

            assert.ok(layer)
            assert.strictEqual(layer.scopeId, `realm:${realmId}`)
            assert.strictEqual(layer.layerType, 'weather')
            assert.strictEqual(layer.value, 'Fog blankets the realm.')
            assert.strictEqual(layer.effectiveFromTick, 1000)
            assert.strictEqual(layer.effectiveToTick, 2000)
        })

        test('setLayerForLocation should create location-scoped layer', async () => {
            const repo = await fixture.getLayerRepository()
            const locationId = crypto.randomUUID()

            const layer = await repo.setLayerForLocation(locationId, 'lighting', 500, null, 'Torches flicker on the walls.')

            assert.ok(layer)
            assert.strictEqual(layer.scopeId, `loc:${locationId}`)
            assert.strictEqual(layer.layerType, 'lighting')
            assert.strictEqual(layer.value, 'Torches flicker on the walls.')
            assert.strictEqual(layer.effectiveFromTick, 500)
            assert.strictEqual(layer.effectiveToTick, null)
        })

        test('setLayerForRealm should support optional metadata', async () => {
            const repo = await fixture.getLayerRepository()
            const realmId = crypto.randomUUID()

            const layer = await repo.setLayerForRealm(realmId, 'weather', 0, null, 'Clear skies.', {
                temperature: 72,
                humidity: 0.3
            })

            assert.ok(layer.metadata)
            assert.strictEqual(layer.metadata.temperature, 72)
            assert.strictEqual(layer.metadata.humidity, 0.3)
        })
    })
})
