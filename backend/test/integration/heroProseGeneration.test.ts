/**
 * Hero Prose Generation Integration Tests
 *
 * These validate the runtime behavior of the HeroProseGenerator:
 * - Cache hit: existing hero prose is used (no OpenAI call)
 * - Cache miss: OpenAI generates and the layer is persisted
 * - Timeout: falls back without persisting
 * - Error: falls back without persisting
 */

import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import type { Container } from 'inversify'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { ILayerRepository } from '../../src/repos/layerRepository.js'
import type { ILocationRepository } from '../../src/repos/locationRepository.js'
import type { IAzureOpenAIClient } from '../../src/services/azureOpenAIClient.js'
import { HeroProseGenerator } from '../../src/services/heroProseGenerator.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describe('Hero Prose Generation', () => {
    let fixture: IntegrationTestFixture
    let layerRepo: ILayerRepository
    let locationRepo: ILocationRepository
    let container: Container

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
        layerRepo = await fixture.getLayerRepository()
        locationRepo = await fixture.getLocationRepository()
        container = await fixture.getContainer()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('cache hit uses existing hero layer without calling OpenAI', async () => {
        const locationId = STARTER_LOCATION_ID

        // Seed hero-prose layer
        await layerRepo.setLayerForLocation(locationId, 'dynamic', 0, null, 'The ancient stones pulse with forgotten magic.', {
            replacesBase: true,
            role: 'hero',
            promptHash: 'test-prompt-v1'
        })

        let called = 0
        const openaiStub: IAzureOpenAIClient = {
            generate: async () => {
                called += 1
                return { content: 'SHOULD NOT HAPPEN', tokenUsage: { prompt: 0, completion: 0, total: 0 } }
            },
            healthCheck: async () => true
        }
        ;(await container.rebind<IAzureOpenAIClient>('IAzureOpenAIClient')).toConstantValue(openaiStub)

        const loc = await locationRepo.get(locationId)
        assert.ok(loc, 'Location should exist')

        const generator = container.get(HeroProseGenerator)
        const telemetry = await fixture.getTelemetryClient()
        ;(telemetry as { clear?: () => void }).clear?.()

        const result = await generator.generateHeroProse({
            locationId,
            locationName: loc.name,
            baseDescription: loc.description,
            timeoutMs: 50
        })

        assert.strictEqual(result.success, true)
        assert.strictEqual(result.reason, 'cache-hit')
        assert.ok(result.prose?.includes('ancient stones pulse'))
        assert.strictEqual(called, 0, 'OpenAI should not be called on cache hit')
    })

    test('cache miss generates hero prose and persists layer', async () => {
        const locationId = STARTER_LOCATION_ID
        const loc = await locationRepo.get(locationId)
        assert.ok(loc, 'Location should exist')

        let called = 0
        const openaiStub: IAzureOpenAIClient = {
            generate: async () => {
                called += 1
                return {
                    content: 'A narrow passage winds between towering rock formations.',
                    tokenUsage: { prompt: 10, completion: 20, total: 30 }
                }
            },
            healthCheck: async () => true
        }
        ;(await container.rebind<IAzureOpenAIClient>('IAzureOpenAIClient')).toConstantValue(openaiStub)

        const generator = container.get(HeroProseGenerator)
        const result = await generator.generateHeroProse({
            locationId,
            locationName: loc.name,
            baseDescription: loc.description,
            timeoutMs: 200
        })

        assert.strictEqual(result.success, true)
        assert.strictEqual(result.reason, 'generated')
        assert.ok(result.prose?.includes('narrow passage'))
        assert.strictEqual(called, 1)

        const layers = await layerRepo.queryLayerHistory(`loc:${locationId}`, 'dynamic')
        const heroLayer = layers.find((l) => l.layerType === 'dynamic' && l.metadata?.role === 'hero')
        assert.ok(heroLayer, 'Hero layer should be created')
        assert.strictEqual(heroLayer?.value, result.prose)
    })

    test('timeout fallback does not persist a hero layer', async () => {
        const locationId = STARTER_LOCATION_ID
        const loc = await locationRepo.get(locationId)
        assert.ok(loc, 'Location should exist')

        const openaiStub: IAzureOpenAIClient = {
            generate: async () => {
                await new Promise<void>((resolve) => setTimeout(resolve, 30))
                return { content: 'Too late.', tokenUsage: { prompt: 0, completion: 0, total: 0 } }
            },
            healthCheck: async () => true
        }
        ;(await container.rebind<IAzureOpenAIClient>('IAzureOpenAIClient')).toConstantValue(openaiStub)

        const generator = container.get(HeroProseGenerator)
        const result = await generator.generateHeroProse({
            locationId,
            locationName: loc.name,
            baseDescription: loc.description,
            timeoutMs: 5
        })

        assert.strictEqual(result.success, false)
        assert.strictEqual(result.reason, 'timeout')

        const layers = await layerRepo.queryLayerHistory(`loc:${locationId}`, 'dynamic')
        const heroLayer = layers.find((l) => l.layerType === 'dynamic' && l.metadata?.role === 'hero')
        assert.ok(!heroLayer, 'Hero layer should not be persisted on timeout')
    })

    test('OpenAI error fallback does not persist a hero layer', async () => {
        const locationId = STARTER_LOCATION_ID
        const loc = await locationRepo.get(locationId)
        assert.ok(loc, 'Location should exist')

        const openaiStub: IAzureOpenAIClient = {
            generate: async () => {
                throw new Error('boom')
            },
            healthCheck: async () => true
        }
        ;(await container.rebind<IAzureOpenAIClient>('IAzureOpenAIClient')).toConstantValue(openaiStub)

        const generator = container.get(HeroProseGenerator)
        const result = await generator.generateHeroProse({
            locationId,
            locationName: loc.name,
            baseDescription: loc.description,
            timeoutMs: 200
        })

        assert.strictEqual(result.success, false)
        assert.strictEqual(result.reason, 'error')

        const layers = await layerRepo.queryLayerHistory(`loc:${locationId}`, 'dynamic')
        const heroLayer = layers.find((l) => l.layerType === 'dynamic' && l.metadata?.role === 'hero')
        assert.ok(!heroLayer, 'Hero layer should not be persisted on error')
    })
})
