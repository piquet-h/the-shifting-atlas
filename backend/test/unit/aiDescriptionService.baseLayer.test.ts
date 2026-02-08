/**
 * Unit tests for AI Description Service - Base Layer Persistence
 *
 * Tests that AI Description Service persists generated descriptions as base layers:
 * - Base layer creation after successful generation
 * - Base layer metadata includes generation details
 * - Base layer uses correct scopeId pattern (loc:<locationId>)
 * - Base layer has indefinite validity (fromTick=0, toTick=null)
 * - Telemetry tracks base layer persistence
 */

import assert from 'node:assert'
import { describe, test } from 'node:test'
import type { Contracts } from 'applicationinsights'
import type { Direction, TerrainType } from '@piquet-h/shared'
import type { DescriptionLayer, LayerType } from '@piquet-h/shared/types/layerRepository'
import type { IAzureOpenAIClient, OpenAIGenerateResult } from '../../src/services/azureOpenAIClient.js'
import type { ITelemetryClient } from '../../src/telemetry/ITelemetryClient.js'
import { TelemetryService } from '../../src/telemetry/TelemetryService.js'
import { AIDescriptionService, type BatchDescriptionRequest } from '../../src/services/AIDescriptionService.js'

// Mock telemetry client
class MockTelemetryClient implements ITelemetryClient {
    events: Array<{ name: string; properties: Record<string, unknown> }> = []

    trackEvent(telemetry: Contracts.EventTelemetry): void {
        this.events.push({ name: telemetry.name, properties: telemetry.properties || {} })
    }

    trackException(): void {}
    trackMetric(): void {}
    trackTrace(): void {}
    trackDependency(): void {}
    trackRequest(): void {}
    addTelemetryProcessor(): void {}
    flush(): void {}

    clear(): void {
        this.events.length = 0
    }

    findEvent(name: string): { name: string; properties: Record<string, unknown> } | undefined {
        return this.events.find((e) => e.name === name)
    }
}

// Mock Azure OpenAI Client
class MockAzureOpenAIClient implements IAzureOpenAIClient {
    async generate(): Promise<OpenAIGenerateResult | null> {
        return {
            content: 'Windswept moorland stretches endlessly beneath vast sky.',
            tokenUsage: { prompt: 150, completion: 30, total: 180 }
        }
    }

    async healthCheck(): Promise<boolean> {
        return true
    }
}

// Mock Layer Repository
interface ILayerRepository {
    setLayerForLocation(
        locationId: string,
        layerType: LayerType,
        fromTick: number,
        toTick: number | null,
        value: string,
        metadata?: Record<string, unknown>
    ): Promise<DescriptionLayer>
}

class MockLayerRepository implements ILayerRepository {
    layers: DescriptionLayer[] = []

    async setLayerForLocation(
        locationId: string,
        layerType: LayerType,
        fromTick: number,
        toTick: number | null,
        value: string,
        metadata?: Record<string, unknown>
    ): Promise<DescriptionLayer> {
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
        return layer
    }

    clear(): void {
        this.layers.length = 0
    }

    findLayer(locationId: string, layerType: LayerType): DescriptionLayer | undefined {
        return this.layers.find((l) => l.scopeId === `loc:${locationId}` && l.layerType === layerType)
    }
}

describe('AIDescriptionService - Base Layer Persistence', () => {
    test('should persist generated description as base layer', async () => {
        const mockClient = new MockAzureOpenAIClient()
        const mockTelemetry = new MockTelemetryClient()
        const telemetryService = new TelemetryService(mockTelemetry)
        const mockLayerRepo = new MockLayerRepository()
        const service = new AIDescriptionService(mockClient, telemetryService, mockLayerRepo)

        const locationId = crypto.randomUUID()
        const request: BatchDescriptionRequest = {
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

        await service.batchGenerateDescriptions(request)

        // Verify base layer was created
        const baseLayer = mockLayerRepo.findLayer(locationId, 'base')
        assert.ok(baseLayer, 'Base layer should be created')
        assert.strictEqual(baseLayer.scopeId, `loc:${locationId}`)
        assert.strictEqual(baseLayer.layerType, 'base')
        assert.strictEqual(baseLayer.value, 'Windswept moorland stretches endlessly beneath vast sky.')
        assert.strictEqual(baseLayer.effectiveFromTick, 0, 'Base layer should start at tick 0')
        assert.strictEqual(baseLayer.effectiveToTick, null, 'Base layer should be indefinite')
    })

    test('should include generation metadata in base layer', async () => {
        const mockClient = new MockAzureOpenAIClient()
        const mockTelemetry = new MockTelemetryClient()
        const telemetryService = new TelemetryService(mockTelemetry)
        const mockLayerRepo = new MockLayerRepository()
        const service = new AIDescriptionService(mockClient, telemetryService, mockLayerRepo)

        const locationId = crypto.randomUUID()
        const request: BatchDescriptionRequest = {
            locations: [
                {
                    locationId,
                    terrain: 'dense-forest' as TerrainType,
                    arrivalDirection: 'west' as Direction,
                    neighbors: ['north', 'south'] as Direction[]
                }
            ],
            style: 'concise'
        }

        await service.batchGenerateDescriptions(request)

        const baseLayer = mockLayerRepo.findLayer(locationId, 'base')
        assert.ok(baseLayer)
        assert.ok(baseLayer.metadata)
        assert.strictEqual(baseLayer.metadata.model, 'gpt-4')
        assert.strictEqual(baseLayer.metadata.style, 'concise')
        assert.strictEqual(baseLayer.metadata.terrain, 'dense-forest')
        assert.ok(baseLayer.metadata.generatedAt)
    })

    test('should track telemetry for base layer persistence', async () => {
        const mockClient = new MockAzureOpenAIClient()
        const mockTelemetry = new MockTelemetryClient()
        const telemetryService = new TelemetryService(mockTelemetry)
        const mockLayerRepo = new MockLayerRepository()
        const service = new AIDescriptionService(mockClient, telemetryService, mockLayerRepo)

        const locationId = crypto.randomUUID()
        const request: BatchDescriptionRequest = {
            locations: [
                {
                    locationId,
                    terrain: 'hilltop' as TerrainType,
                    arrivalDirection: 'south' as Direction,
                    neighbors: ['north'] as Direction[]
                }
            ],
            style: 'utilitarian'
        }

        await service.batchGenerateDescriptions(request)

        const persistEvent = mockTelemetry.findEvent('AI.Description.BaseLayerPersisted')
        assert.ok(persistEvent, 'Should track base layer persistence event')
        assert.strictEqual(persistEvent.properties.locationId, locationId)
        assert.strictEqual(persistEvent.properties.layerType, 'base')
    })

    test('should persist base layers for each location in batch', async () => {
        const mockClient = new MockAzureOpenAIClient()
        const mockTelemetry = new MockTelemetryClient()
        const telemetryService = new TelemetryService(mockTelemetry)
        const mockLayerRepo = new MockLayerRepository()
        const service = new AIDescriptionService(mockClient, telemetryService, mockLayerRepo)

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
                    terrain: 'riverbank' as TerrainType,
                    arrivalDirection: 'east' as Direction,
                    neighbors: ['west'] as Direction[]
                }
            ],
            style: 'atmospheric'
        }

        await service.batchGenerateDescriptions(request)

        assert.strictEqual(mockLayerRepo.layers.length, 2, 'Should create 2 base layers')
        assert.ok(mockLayerRepo.findLayer(locationId1, 'base'))
        assert.ok(mockLayerRepo.findLayer(locationId2, 'base'))
    })
})
