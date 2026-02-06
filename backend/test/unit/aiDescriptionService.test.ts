/**
 * Unit tests for AI Description Service
 *
 * Tests AI-powered batch location description generation:
 * - Batch size validation (max 20 locations)
 * - Prompt construction with terrain guidance
 * - Cost calculation per location
 * - Error handling with exponential backoff
 * - Fallback to template-based descriptions
 * - Telemetry event emissions
 *
 * See: Issue - AI Description Batch Generation Service
 */

import assert from 'node:assert'
import { describe, test } from 'node:test'
import type { Contracts } from 'applicationinsights'
import type { Direction, TerrainType } from '@piquet-h/shared'
import type { IAzureOpenAIClient, OpenAIGenerateResult } from '../../src/services/azureOpenAIClient.js'
import type { ITelemetryClient } from '../../src/telemetry/ITelemetryClient.js'
import { TelemetryService } from '../../src/telemetry/TelemetryService.js'
import {
    AIDescriptionService,
    type BatchDescriptionRequest,
    type GeneratedDescription
} from '../../src/services/AIDescriptionService.js'

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
    private generateFn: (prompt: string) => Promise<OpenAIGenerateResult | null>

    constructor(generateFn?: (prompt: string) => Promise<OpenAIGenerateResult | null>) {
        this.generateFn =
            generateFn ||
            (async (prompt: string) => ({
                content: `Generated description for: ${prompt.substring(0, 50)}`,
                tokenUsage: { prompt: 150, completion: 50, total: 200 }
            }))
    }

    async generate(options: { prompt: string }): Promise<OpenAIGenerateResult | null> {
        return this.generateFn(options.prompt)
    }

    async healthCheck(): Promise<boolean> {
        return true
    }
}

describe('AIDescriptionService - Batch Size Validation', () => {
    test('should accept batch size of 1', async () => {
        const mockClient = new MockAzureOpenAIClient()
        const mockTelemetry = new MockTelemetryClient()
        const telemetryService = new TelemetryService(mockTelemetry)
        const service = new AIDescriptionService(mockClient, telemetryService)

        const request: BatchDescriptionRequest = {
            locations: [
                {
                    locationId: 'loc-1',
                    terrain: 'open-plain' as TerrainType,
                    arrivalDirection: 'north' as Direction,
                    neighbors: ['south' as Direction]
                }
            ],
            style: 'concise'
        }

        const result = await service.batchGenerateDescriptions(request)

        assert.strictEqual(result.length, 1)
        assert.strictEqual(result[0].locationId, 'loc-1')
    })

    test('should accept batch size of 20', async () => {
        const mockClient = new MockAzureOpenAIClient()
        const mockTelemetry = new MockTelemetryClient()
        const telemetryService = new TelemetryService(mockTelemetry)
        const service = new AIDescriptionService(mockClient, telemetryService)

        const locations = Array.from({ length: 20 }, (_, i) => ({
            locationId: `loc-${i}`,
            terrain: 'open-plain' as TerrainType,
            arrivalDirection: 'north' as Direction,
            neighbors: ['south' as Direction]
        }))

        const request: BatchDescriptionRequest = {
            locations,
            style: 'concise'
        }

        const result = await service.batchGenerateDescriptions(request)

        assert.strictEqual(result.length, 20)
    })

    test('should reject batch size > 20', async () => {
        const mockClient = new MockAzureOpenAIClient()
        const mockTelemetry = new MockTelemetryClient()
        const telemetryService = new TelemetryService(mockTelemetry)
        const service = new AIDescriptionService(mockClient, telemetryService)

        const locations = Array.from({ length: 21 }, (_, i) => ({
            locationId: `loc-${i}`,
            terrain: 'open-plain' as TerrainType,
            arrivalDirection: 'north' as Direction,
            neighbors: ['south' as Direction]
        }))

        const request: BatchDescriptionRequest = {
            locations,
            style: 'concise'
        }

        await assert.rejects(
            async () => await service.batchGenerateDescriptions(request),
            (error: Error) => {
                assert.strictEqual(error.message, 'Batch size exceeds maximum of 20 locations (got 21)')
                return true
            }
        )
    })
})

describe('AIDescriptionService - Prompt Construction', () => {
    test('should include terrain type in prompt', async () => {
        let capturedPrompt = ''
        const mockClient = new MockAzureOpenAIClient(async (prompt: string) => {
            capturedPrompt = prompt
            return {
                content: 'A windswept moorland stretches endlessly.',
                tokenUsage: { prompt: 150, completion: 50, total: 200 }
            }
        })

        const mockTelemetry = new MockTelemetryClient()
        const telemetryService = new TelemetryService(mockTelemetry)
        const service = new AIDescriptionService(mockClient, telemetryService)

        const request: BatchDescriptionRequest = {
            locations: [
                {
                    locationId: 'loc-1',
                    terrain: 'dense-forest' as TerrainType,
                    arrivalDirection: 'north' as Direction,
                    neighbors: ['south' as Direction]
                }
            ],
            style: 'concise'
        }

        await service.batchGenerateDescriptions(request)

        assert.ok(capturedPrompt.includes('dense-forest'), 'Prompt should include terrain type')
    })

    test('should include arrival direction in prompt', async () => {
        let capturedPrompt = ''
        const mockClient = new MockAzureOpenAIClient(async (prompt: string) => {
            capturedPrompt = prompt
            return {
                content: 'You arrive from the east.',
                tokenUsage: { prompt: 150, completion: 50, total: 200 }
            }
        })

        const mockTelemetry = new MockTelemetryClient()
        const telemetryService = new TelemetryService(mockTelemetry)
        const service = new AIDescriptionService(mockClient, telemetryService)

        const request: BatchDescriptionRequest = {
            locations: [
                {
                    locationId: 'loc-1',
                    terrain: 'open-plain' as TerrainType,
                    arrivalDirection: 'east' as Direction,
                    neighbors: ['west' as Direction]
                }
            ],
            style: 'concise'
        }

        await service.batchGenerateDescriptions(request)

        assert.ok(capturedPrompt.includes('east'), 'Prompt should include arrival direction')
    })

    test('should include exit directions in prompt', async () => {
        let capturedPrompt = ''
        const mockClient = new MockAzureOpenAIClient(async (prompt: string) => {
            capturedPrompt = prompt
            return {
                content: 'Paths lead north and south.',
                tokenUsage: { prompt: 150, completion: 50, total: 200 }
            }
        })

        const mockTelemetry = new MockTelemetryClient()
        const telemetryService = new TelemetryService(mockTelemetry)
        const service = new AIDescriptionService(mockClient, telemetryService)

        const request: BatchDescriptionRequest = {
            locations: [
                {
                    locationId: 'loc-1',
                    terrain: 'open-plain' as TerrainType,
                    arrivalDirection: 'west' as Direction,
                    neighbors: ['north' as Direction, 'south' as Direction, 'east' as Direction]
                }
            ],
            style: 'concise'
        }

        await service.batchGenerateDescriptions(request)

        assert.ok(capturedPrompt.includes('north') && capturedPrompt.includes('south'), 'Prompt should include exit directions')
    })

    test('should be objective without temporal elements (per agent instructions)', async () => {
        let capturedPrompt = ''
        const mockClient = new MockAzureOpenAIClient(async (prompt: string) => {
            capturedPrompt = prompt
            return {
                content: 'A stone bridge spans a river.',
                tokenUsage: { prompt: 150, completion: 50, total: 200 }
            }
        })

        const mockTelemetry = new MockTelemetryClient()
        const telemetryService = new TelemetryService(mockTelemetry)
        const service = new AIDescriptionService(mockClient, telemetryService)

        const request: BatchDescriptionRequest = {
            locations: [
                {
                    locationId: 'loc-1',
                    terrain: 'riverbank' as TerrainType,
                    arrivalDirection: 'north' as Direction,
                    neighbors: ['south' as Direction]
                }
            ],
            style: 'concise'
        }

        await service.batchGenerateDescriptions(request)

        // Ensure prompt doesn't reference temporal/weather in a way that would encourage their use
        // It's OK to say "no sunset", but not OK to say "at sunset"
        assert.ok(!capturedPrompt.toLowerCase().includes('at sunset'), 'Prompt should not describe time of day')
        assert.ok(!capturedPrompt.toLowerCase().includes('during rain'), 'Prompt should not describe weather conditions')
        assert.ok(!capturedPrompt.toLowerCase().includes('in fog'), 'Prompt should not describe atmospheric conditions')
    })
})

describe('AIDescriptionService - Cost Calculation', () => {
    test('should calculate cost per location', async () => {
        const mockClient = new MockAzureOpenAIClient(async () => ({
            content: 'A forest clearing.',
            tokenUsage: { prompt: 150, completion: 50, total: 200 }
        }))

        const mockTelemetry = new MockTelemetryClient()
        const telemetryService = new TelemetryService(mockTelemetry)
        const service = new AIDescriptionService(mockClient, telemetryService)

        const request: BatchDescriptionRequest = {
            locations: [
                {
                    locationId: 'loc-1',
                    terrain: 'dense-forest' as TerrainType,
                    arrivalDirection: 'north' as Direction,
                    neighbors: ['south' as Direction]
                }
            ],
            style: 'concise'
        }

        const result = await service.batchGenerateDescriptions(request)

        assert.strictEqual(result.length, 1)
        assert.ok(result[0].cost > 0, 'Cost should be calculated')
        assert.ok(result[0].tokensUsed > 0, 'Tokens used should be tracked')
    })

    test('should track total cost for batch', async () => {
        const mockClient = new MockAzureOpenAIClient(async () => ({
            content: 'A location.',
            tokenUsage: { prompt: 100, completion: 50, total: 150 }
        }))

        const mockTelemetry = new MockTelemetryClient()
        const telemetryService = new TelemetryService(mockTelemetry)
        const service = new AIDescriptionService(mockClient, telemetryService)

        const request: BatchDescriptionRequest = {
            locations: Array.from({ length: 5 }, (_, i) => ({
                locationId: `loc-${i}`,
                terrain: 'open-plain' as TerrainType,
                arrivalDirection: 'north' as Direction,
                neighbors: ['south' as Direction]
            })),
            style: 'concise'
        }

        const result = await service.batchGenerateDescriptions(request)

        const totalCost = result.reduce((sum, desc) => sum + desc.cost, 0)
        assert.ok(totalCost > 0, 'Total cost should be calculated')
    })
})

describe('AIDescriptionService - Telemetry', () => {
    test('should emit AI.Description.BatchGenerated event on success', async () => {
        const mockClient = new MockAzureOpenAIClient()
        const mockTelemetry = new MockTelemetryClient()
        const telemetryService = new TelemetryService(mockTelemetry)
        const service = new AIDescriptionService(mockClient, telemetryService)

        const request: BatchDescriptionRequest = {
            locations: Array.from({ length: 3 }, (_, i) => ({
                locationId: `loc-${i}`,
                terrain: 'open-plain' as TerrainType,
                arrivalDirection: 'north' as Direction,
                neighbors: ['south' as Direction]
            })),
            style: 'concise'
        }

        await service.batchGenerateDescriptions(request)

        const event = mockTelemetry.findEvent('AI.Description.BatchGenerated')
        assert.ok(event, 'Should emit AI.Description.BatchGenerated event')
        assert.strictEqual(event.properties['requestCount'], 3)
        assert.ok(event.properties['totalTokens'] !== undefined)
        assert.ok(event.properties['totalCost'] !== undefined)
    })

    test('should emit AI.Description.Fallback event on API failure', async () => {
        const mockClient = new MockAzureOpenAIClient(async () => null)
        const mockTelemetry = new MockTelemetryClient()
        const telemetryService = new TelemetryService(mockTelemetry)
        const service = new AIDescriptionService(mockClient, telemetryService)

        const request: BatchDescriptionRequest = {
            locations: [
                {
                    locationId: 'loc-1',
                    terrain: 'open-plain' as TerrainType,
                    arrivalDirection: 'north' as Direction,
                    neighbors: ['south' as Direction]
                }
            ],
            style: 'concise'
        }

        const result = await service.batchGenerateDescriptions(request)

        const event = mockTelemetry.findEvent('AI.Description.Fallback')
        assert.ok(event, 'Should emit AI.Description.Fallback event on API failure')
        assert.strictEqual(result[0].description.includes('open plain'), true, 'Should use template fallback')
    })
})

describe('AIDescriptionService - Error Handling', () => {
    test('should retry on transient error', async () => {
        let callCount = 0
        const mockClient = new MockAzureOpenAIClient(async () => {
            callCount++
            if (callCount < 2) {
                return null // Fail first time
            }
            return {
                content: 'A successful description.',
                tokenUsage: { prompt: 100, completion: 50, total: 150 }
            }
        })

        const mockTelemetry = new MockTelemetryClient()
        const telemetryService = new TelemetryService(mockTelemetry)
        const service = new AIDescriptionService(mockClient, telemetryService)

        const request: BatchDescriptionRequest = {
            locations: [
                {
                    locationId: 'loc-1',
                    terrain: 'open-plain' as TerrainType,
                    arrivalDirection: 'north' as Direction,
                    neighbors: ['south' as Direction]
                }
            ],
            style: 'concise'
        }

        const result = await service.batchGenerateDescriptions(request)

        assert.ok(callCount > 1, 'Should retry on failure')
        assert.strictEqual(result[0].description, 'A successful description.')
    })

    test('should fall back to template after max retries', async () => {
        const mockClient = new MockAzureOpenAIClient(async () => null)
        const mockTelemetry = new MockTelemetryClient()
        const telemetryService = new TelemetryService(mockTelemetry)
        const service = new AIDescriptionService(mockClient, telemetryService)

        const request: BatchDescriptionRequest = {
            locations: [
                {
                    locationId: 'loc-1',
                    terrain: 'hilltop' as TerrainType,
                    arrivalDirection: 'north' as Direction,
                    neighbors: ['south' as Direction, 'down' as Direction]
                }
            ],
            style: 'concise'
        }

        const result = await service.batchGenerateDescriptions(request)

        assert.ok(result[0].description.length > 0, 'Should return template-based description')
        assert.strictEqual(result[0].description.includes('hilltop'), true, 'Template should include terrain type')
    })
})
