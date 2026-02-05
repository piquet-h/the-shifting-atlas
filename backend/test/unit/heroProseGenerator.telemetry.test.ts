/**
 * Unit tests for Hero Prose Generator Telemetry
 *
 * Tests telemetry event emissions for hero prose generation:
 * - Description.Hero.CacheHit / CacheMiss
 * - Description.Hero.GenerateSuccess / Failure
 * - Low-cardinality dimensions: locationId, latencyMs, outcomeReason, model
 * - No raw prompts or prose in telemetry
 *
 * See: Issue #738 - Hero Prose Telemetry
 */

import assert from 'node:assert'
import { describe, test } from 'node:test'
import type { Contracts } from 'applicationinsights'
import type { DescriptionLayer } from '@piquet-h/shared/types/layerRepository'
import type { AzureOpenAIClientConfig, IAzureOpenAIClient } from '../../src/services/azureOpenAIClient.js'
import { HeroProseGenerator } from '../../src/services/heroProseGenerator.js'
import type { ILayerRepository } from '../../src/repos/layerRepository.js'
import type { ITelemetryClient } from '../../src/telemetry/ITelemetryClient.js'
import { TelemetryService } from '../../src/telemetry/TelemetryService.js'

// Mock telemetry client
class MockTelemetryClient implements ITelemetryClient {
    events: Array<{ name: string; properties: Record<string, unknown> }> = []

    trackEvent(telemetry: Contracts.EventTelemetry): void {
        this.events.push({ name: telemetry.name, properties: telemetry.properties || {} })
    }

    trackException(): void {
        // Not used in these tests
    }

    trackMetric(): void {
        // Not used in these tests
    }

    trackTrace(): void {
        // Not used in these tests
    }

    trackDependency(): void {
        // Not used in these tests
    }

    trackRequest(): void {
        // Not used in these tests
    }

    addTelemetryProcessor(): void {
        // Not used in these tests
    }

    flush(): void {
        // Not used in these tests
    }

    clear(): void {
        this.events.length = 0
    }

    findEvent(name: string): { name: string; properties: Record<string, unknown> } | undefined {
        return this.events.find((e) => e.name === name)
    }
}

// Mock layer repository
class MockLayerRepository implements ILayerRepository {
    private layers: DescriptionLayer[] = []

    async queryLayerHistory(scopeId: string, layerType: string): Promise<DescriptionLayer[]> {
        return this.layers.filter((l) => l.scopeId === scopeId && l.layerType === layerType)
    }

    async setLayerForLocation(
        locationId: string,
        layerType: string,
        fromTick: number,
        toTick: number | null,
        value: string,
        metadata?: Record<string, unknown>
    ): Promise<void> {
        const layer: DescriptionLayer = {
            id: crypto.randomUUID(),
            scopeId: `loc:${locationId}`,
            layerType,
            value,
            effectiveFromTick: fromTick,
            effectiveToTick: toTick,
            authoredAt: new Date().toISOString(),
            metadata
        }
        this.layers.push(layer)
    }

    seedLayer(layer: DescriptionLayer): void {
        this.layers.push(layer)
    }

    // Unused interface methods
    async getLayersForLocation(): Promise<DescriptionLayer[]> {
        throw new Error('Not implemented')
    }
    async getLayerHistory(): Promise<DescriptionLayer[]> {
        throw new Error('Not implemented')
    }
}

describe('Hero Prose Generator - Telemetry', () => {
    describe('Cache telemetry', () => {
        test('emits Description.Hero.CacheHit with locationId and latencyMs', async () => {
            const mockClient = new MockTelemetryClient()
            const telemetry = new TelemetryService(mockClient)
            const layerRepo = new MockLayerRepository()
            const openaiClient: IAzureOpenAIClient = {
                generate: async () => null,
                healthCheck: async () => false
            }
            const config: AzureOpenAIClientConfig = {
                endpoint: 'https://test.openai.azure.com',
                model: 'gpt-4'
            }

            // Seed existing hero prose layer
            layerRepo.seedLayer({
                id: crypto.randomUUID(),
                scopeId: 'loc:test-location',
                layerType: 'dynamic',
                value: 'Cached hero prose',
                effectiveFromTick: 0,
                effectiveToTick: null,
                authoredAt: new Date().toISOString(),
                metadata: {
                    replacesBase: true,
                    role: 'hero',
                    promptHash: 'cached-hash'
                }
            })

            const generator = new HeroProseGenerator(openaiClient, layerRepo, telemetry, config)

            await generator.generateHeroProse({
                locationId: 'test-location',
                locationName: 'Test Location',
                baseDescription: 'A test location'
            })

            const event = mockClient.findEvent('Description.Hero.CacheHit')
            assert.ok(event, 'CacheHit event should be emitted')
            assert.strictEqual(event.properties.locationId, 'test-location')
            assert.ok(typeof event.properties.latencyMs === 'number')
            assert.ok((event.properties.latencyMs as number) >= 0)
        })

        test('emits Description.Hero.CacheMiss when no hero prose exists', async () => {
            const mockClient = new MockTelemetryClient()
            const telemetry = new TelemetryService(mockClient)
            const layerRepo = new MockLayerRepository()
            const openaiClient: IAzureOpenAIClient = {
                generate: async () => ({
                    content: 'Generated prose',
                    tokenUsage: { prompt: 10, completion: 20, total: 30 }
                }),
                healthCheck: async () => true
            }
            const config: AzureOpenAIClientConfig = {
                endpoint: 'https://test.openai.azure.com',
                model: 'gpt-4'
            }

            const generator = new HeroProseGenerator(openaiClient, layerRepo, telemetry, config)

            await generator.generateHeroProse({
                locationId: 'test-location',
                locationName: 'Test Location',
                baseDescription: 'A test location'
            })

            const event = mockClient.findEvent('Description.Hero.CacheMiss')
            assert.ok(event, 'CacheMiss event should be emitted')
            assert.strictEqual(event.properties.locationId, 'test-location')
            assert.ok(typeof event.properties.latencyMs === 'number')
        })

        test('does not include raw prose in cache hit telemetry', async () => {
            const mockClient = new MockTelemetryClient()
            const telemetry = new TelemetryService(mockClient)
            const layerRepo = new MockLayerRepository()
            const openaiClient: IAzureOpenAIClient = {
                generate: async () => null,
                healthCheck: async () => false
            }
            const config: AzureOpenAIClientConfig = {
                endpoint: 'https://test.openai.azure.com',
                model: 'gpt-4'
            }

            layerRepo.seedLayer({
                id: crypto.randomUUID(),
                scopeId: 'loc:test-location',
                layerType: 'dynamic',
                value: 'SECRET_PROSE_CONTENT',
                effectiveFromTick: 0,
                effectiveToTick: null,
                authoredAt: new Date().toISOString(),
                metadata: {
                    replacesBase: true,
                    role: 'hero',
                    promptHash: 'hash'
                }
            })

            const generator = new HeroProseGenerator(openaiClient, layerRepo, telemetry, config)

            await generator.generateHeroProse({
                locationId: 'test-location',
                locationName: 'Test Location',
                baseDescription: 'A test location'
            })

            const event = mockClient.findEvent('Description.Hero.CacheHit')
            assert.ok(event, 'CacheHit event should be emitted')

            // Ensure no prose content leaked into telemetry
            const eventStr = JSON.stringify(event.properties)
            assert.ok(!eventStr.includes('SECRET_PROSE_CONTENT'), 'Prose content must not appear in telemetry')
        })
    })

    describe('Generation success telemetry', () => {
        test('emits Description.Hero.GenerateSuccess with required dimensions', async () => {
            const mockClient = new MockTelemetryClient()
            const telemetry = new TelemetryService(mockClient)
            const layerRepo = new MockLayerRepository()
            const openaiClient: IAzureOpenAIClient = {
                generate: async () => ({
                    content: 'Generated hero prose',
                    tokenUsage: { prompt: 15, completion: 25, total: 40 }
                }),
                healthCheck: async () => true
            }
            const config: AzureOpenAIClientConfig = {
                endpoint: 'https://test.openai.azure.com',
                model: 'gpt-4-test-model'
            }

            const generator = new HeroProseGenerator(openaiClient, layerRepo, telemetry, config)

            await generator.generateHeroProse({
                locationId: 'test-location',
                locationName: 'Test Location',
                baseDescription: 'A test location'
            })

            const event = mockClient.findEvent('Description.Hero.GenerateSuccess')
            assert.ok(event, 'Generate.Success event should be emitted')
            assert.strictEqual(event.properties.locationId, 'test-location')
            assert.ok(typeof event.properties.latencyMs === 'number')
            assert.strictEqual(event.properties.model, 'gpt-4-test-model')
            assert.strictEqual(event.properties.tokenUsage, 40)
        })

        test('does not include raw prompt or prose in success telemetry', async () => {
            const mockClient = new MockTelemetryClient()
            const telemetry = new TelemetryService(mockClient)
            const layerRepo = new MockLayerRepository()
            const openaiClient: IAzureOpenAIClient = {
                generate: async () => ({
                    content: 'SECRET_GENERATED_PROSE',
                    tokenUsage: { prompt: 10, completion: 20, total: 30 }
                }),
                healthCheck: async () => true
            }
            const config: AzureOpenAIClientConfig = {
                endpoint: 'https://test.openai.azure.com',
                model: 'gpt-4'
            }

            const generator = new HeroProseGenerator(openaiClient, layerRepo, telemetry, config)

            await generator.generateHeroProse({
                locationId: 'test-location',
                locationName: 'SECRET_LOCATION_NAME',
                baseDescription: 'SECRET_DESCRIPTION'
            })

            const event = mockClient.findEvent('Description.Hero.GenerateSuccess')
            assert.ok(event, 'Generate.Success event should be emitted')

            const eventStr = JSON.stringify(event.properties)
            assert.ok(!eventStr.includes('SECRET_GENERATED_PROSE'), 'Generated prose must not appear in telemetry')
            assert.ok(!eventStr.includes('SECRET_LOCATION_NAME'), 'Location name must not appear in telemetry')
            assert.ok(!eventStr.includes('SECRET_DESCRIPTION'), 'Base description must not appear in telemetry')
        })
    })

    describe('Generation failure telemetry', () => {
        test('emits Failure with outcomeReason=timeout when timeout occurs', async () => {
            const mockClient = new MockTelemetryClient()
            const telemetry = new TelemetryService(mockClient)
            const layerRepo = new MockLayerRepository()
            const openaiClient: IAzureOpenAIClient = {
                generate: async () => {
                    // Simulate slow response
                    await new Promise((resolve) => setTimeout(resolve, 100))
                    return { content: 'Too slow', tokenUsage: { prompt: 0, completion: 0, total: 0 } }
                },
                healthCheck: async () => true
            }
            const config: AzureOpenAIClientConfig = {
                endpoint: 'https://test.openai.azure.com',
                model: 'gpt-4'
            }

            const generator = new HeroProseGenerator(openaiClient, layerRepo, telemetry, config)

            await generator.generateHeroProse({
                locationId: 'test-location',
                locationName: 'Test Location',
                baseDescription: 'A test location',
                timeoutMs: 50 // Force timeout
            })

            const event = mockClient.findEvent('Description.Hero.GenerateFailure')
            assert.ok(event, 'Generate.Failure event should be emitted')
            assert.strictEqual(event.properties.locationId, 'test-location')
            assert.strictEqual(event.properties.outcomeReason, 'timeout')
            assert.ok(typeof event.properties.latencyMs === 'number')
            assert.strictEqual(event.properties.model, 'gpt-4')
        })

        test('emits Failure with outcomeReason=error when OpenAI returns null', async () => {
            const mockClient = new MockTelemetryClient()
            const telemetry = new TelemetryService(mockClient)
            const layerRepo = new MockLayerRepository()
            const openaiClient: IAzureOpenAIClient = {
                generate: async () => null, // Simulate OpenAI error
                healthCheck: async () => true
            }
            const config: AzureOpenAIClientConfig = {
                endpoint: 'https://test.openai.azure.com',
                model: 'gpt-4'
            }

            const generator = new HeroProseGenerator(openaiClient, layerRepo, telemetry, config)

            await generator.generateHeroProse({
                locationId: 'test-location',
                locationName: 'Test Location',
                baseDescription: 'A test location'
            })

            const event = mockClient.findEvent('Description.Hero.GenerateFailure')
            assert.ok(event, 'Generate.Failure event should be emitted')
            assert.strictEqual(event.properties.outcomeReason, 'error')
            assert.strictEqual(event.properties.model, 'gpt-4')
        })

        test('emits Failure with outcomeReason=invalid-response for empty prose', async () => {
            const mockClient = new MockTelemetryClient()
            const telemetry = new TelemetryService(mockClient)
            const layerRepo = new MockLayerRepository()
            const openaiClient: IAzureOpenAIClient = {
                generate: async () => ({
                    content: '   ', // Empty/whitespace content
                    tokenUsage: { prompt: 10, completion: 0, total: 10 }
                }),
                healthCheck: async () => true
            }
            const config: AzureOpenAIClientConfig = {
                endpoint: 'https://test.openai.azure.com',
                model: 'gpt-4'
            }

            const generator = new HeroProseGenerator(openaiClient, layerRepo, telemetry, config)

            await generator.generateHeroProse({
                locationId: 'test-location',
                locationName: 'Test Location',
                baseDescription: 'A test location'
            })

            const event = mockClient.findEvent('Description.Hero.GenerateFailure')
            assert.ok(event, 'Generate.Failure event should be emitted')
            assert.strictEqual(event.properties.outcomeReason, 'invalid-response')
        })

        test('emits Failure with outcomeReason=invalid-response for prose exceeding 1200 chars', async () => {
            const mockClient = new MockTelemetryClient()
            const telemetry = new TelemetryService(mockClient)
            const layerRepo = new MockLayerRepository()
            const openaiClient: IAzureOpenAIClient = {
                generate: async () => ({
                    content: 'x'.repeat(1201), // Exceeds limit
                    tokenUsage: { prompt: 10, completion: 200, total: 210 }
                }),
                healthCheck: async () => true
            }
            const config: AzureOpenAIClientConfig = {
                endpoint: 'https://test.openai.azure.com',
                model: 'gpt-4'
            }

            const generator = new HeroProseGenerator(openaiClient, layerRepo, telemetry, config)

            await generator.generateHeroProse({
                locationId: 'test-location',
                locationName: 'Test Location',
                baseDescription: 'A test location'
            })

            const event = mockClient.findEvent('Description.Hero.GenerateFailure')
            assert.ok(event, 'Generate.Failure event should be emitted')
            assert.strictEqual(event.properties.outcomeReason, 'invalid-response')
        })

        test('emits Failure with outcomeReason=config-missing when endpoint not configured', async () => {
            const mockClient = new MockTelemetryClient()
            const telemetry = new TelemetryService(mockClient)
            const layerRepo = new MockLayerRepository()
            const openaiClient: IAzureOpenAIClient = {
                generate: async () => null,
                healthCheck: async () => false
            }
            const config: AzureOpenAIClientConfig = {
                endpoint: '', // Missing endpoint
                model: 'gpt-4'
            }

            const generator = new HeroProseGenerator(openaiClient, layerRepo, telemetry, config)

            await generator.generateHeroProse({
                locationId: 'test-location',
                locationName: 'Test Location',
                baseDescription: 'A test location'
            })

            const event = mockClient.findEvent('Description.Hero.GenerateFailure')
            assert.ok(event, 'Generate.Failure event should be emitted')
            assert.strictEqual(event.properties.outcomeReason, 'config-missing')
            assert.strictEqual(event.properties.locationId, 'test-location')
            // Model should not be included when config is missing
            assert.strictEqual(event.properties.model, undefined)
        })

        test('emits Failure with outcomeReason=error on unexpected exception', async () => {
            const mockClient = new MockTelemetryClient()
            const telemetry = new TelemetryService(mockClient)
            const layerRepo = new MockLayerRepository()
            const openaiClient: IAzureOpenAIClient = {
                generate: async () => {
                    throw new Error('Unexpected OpenAI error')
                },
                healthCheck: async () => true
            }
            const config: AzureOpenAIClientConfig = {
                endpoint: 'https://test.openai.azure.com',
                model: 'gpt-4'
            }

            const generator = new HeroProseGenerator(openaiClient, layerRepo, telemetry, config)

            await generator.generateHeroProse({
                locationId: 'test-location',
                locationName: 'Test Location',
                baseDescription: 'A test location'
            })

            const event = mockClient.findEvent('Description.Hero.GenerateFailure')
            assert.ok(event, 'Generate.Failure event should be emitted')
            assert.strictEqual(event.properties.outcomeReason, 'error')
            assert.strictEqual(event.properties.model, 'gpt-4')
        })
    })

    describe('Low-cardinality outcome reasons', () => {
        test('outcomeReason values are bounded and low-cardinality', async () => {
            const mockClient = new MockTelemetryClient()
            const telemetry = new TelemetryService(mockClient)
            const layerRepo = new MockLayerRepository()

            // Test all failure scenarios and collect outcomeReasons
            const scenarios = [
                {
                    name: 'timeout',
                    client: {
                        generate: async () => ({ content: 'x', tokenUsage: { prompt: 0, completion: 0, total: 0 } }),
                        healthCheck: async () => true
                    },
                    config: { endpoint: 'https://test.openai.azure.com', model: 'gpt-4' },
                    timeoutMs: 1
                },
                {
                    name: 'error',
                    client: { generate: async () => null, healthCheck: async () => true },
                    config: { endpoint: 'https://test.openai.azure.com', model: 'gpt-4' },
                    timeoutMs: 1000
                },
                {
                    name: 'invalid-response',
                    client: {
                        generate: async () => ({ content: '', tokenUsage: { prompt: 0, completion: 0, total: 0 } }),
                        healthCheck: async () => true
                    },
                    config: { endpoint: 'https://test.openai.azure.com', model: 'gpt-4' },
                    timeoutMs: 1000
                },
                {
                    name: 'config-missing',
                    client: { generate: async () => null, healthCheck: async () => false },
                    config: { endpoint: '', model: 'gpt-4' },
                    timeoutMs: 1000
                }
            ]

            const allowedReasons = new Set(['timeout', 'error', 'invalid-response', 'config-missing'])

            for (const scenario of scenarios) {
                mockClient.clear()
                const generator = new HeroProseGenerator(
                    scenario.client as IAzureOpenAIClient,
                    layerRepo,
                    telemetry,
                    scenario.config as AzureOpenAIClientConfig
                )

                await generator.generateHeroProse({
                    locationId: 'test-location',
                    locationName: 'Test',
                    baseDescription: 'Test',
                    timeoutMs: scenario.timeoutMs
                })

                const event = mockClient.findEvent('Description.Hero.GenerateFailure')
                assert.ok(event, `Failure event should be emitted for ${scenario.name}`)
                assert.ok(
                    allowedReasons.has(event.properties.outcomeReason as string),
                    `outcomeReason '${event.properties.outcomeReason}' must be low-cardinality`
                )
            }
        })
    })
})
