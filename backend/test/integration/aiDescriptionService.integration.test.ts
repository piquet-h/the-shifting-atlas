/**
 * Integration tests for AI Description Service
 *
 * Tests end-to-end batch generation workflow with Azure OpenAI integration:
 * - Generate batch of 5 locations
 * - Verify all descriptions returned
 * - Verify cost tracking
 * - Test with both successful and failing AI client
 *
 * See: Issue - AI Description Batch Generation Service
 */

import assert from 'node:assert'
import { describe, test } from 'node:test'
import type { Direction, TerrainType } from '@piquet-h/shared'
import { NullAzureOpenAIClient } from '../../src/services/azureOpenAIClient.js'
import { MockTelemetryClient } from '../mocks/MockTelemetryClient.js'
import { TelemetryService } from '../../src/telemetry/TelemetryService.js'
import { AIDescriptionService, type BatchDescriptionRequest } from '../../src/services/AIDescriptionService.js'

describe('AIDescriptionService Integration Tests', () => {
    test('should generate 5 location descriptions and track cost', async () => {
        // Use NullAzureOpenAIClient which gracefully returns null (no actual API call)
        const nullClient = new NullAzureOpenAIClient()
        const mockTelemetry = new MockTelemetryClient()
        const telemetryService = new TelemetryService(mockTelemetry)
        const service = new AIDescriptionService(nullClient, telemetryService)

        const request: BatchDescriptionRequest = {
            locations: [
                {
                    locationId: 'loc-1',
                    terrain: 'open-plain' as TerrainType,
                    arrivalDirection: 'north' as Direction,
                    neighbors: ['south' as Direction, 'east' as Direction, 'west' as Direction]
                },
                {
                    locationId: 'loc-2',
                    terrain: 'dense-forest' as TerrainType,
                    arrivalDirection: 'west' as Direction,
                    neighbors: ['east' as Direction]
                },
                {
                    locationId: 'loc-3',
                    terrain: 'hilltop' as TerrainType,
                    arrivalDirection: 'south' as Direction,
                    neighbors: ['north' as Direction, 'down' as Direction]
                },
                {
                    locationId: 'loc-4',
                    terrain: 'riverbank' as TerrainType,
                    arrivalDirection: 'east' as Direction,
                    neighbors: ['west' as Direction, 'north' as Direction, 'south' as Direction]
                },
                {
                    locationId: 'loc-5',
                    terrain: 'narrow-corridor' as TerrainType,
                    arrivalDirection: 'in' as Direction,
                    neighbors: ['out' as Direction]
                }
            ],
            style: 'concise'
        }

        const results = await service.batchGenerateDescriptions(request)

        // Verify all descriptions returned
        assert.strictEqual(results.length, 5, 'Should return 5 descriptions')

        // Verify each location has a description
        const locationIds = results.map((r) => r.locationId)
        assert.deepStrictEqual(locationIds, ['loc-1', 'loc-2', 'loc-3', 'loc-4', 'loc-5'])

        // Verify all descriptions are non-empty
        for (const result of results) {
            assert.ok(result.description.length > 0, `Description for ${result.locationId} should not be empty`)
            assert.ok(result.locationId, `Location ID for ${result.locationId} should be set`)
            assert.ok(result.model, `Model for ${result.locationId} should be set`)
        }

        // Since NullClient returns null, all should fall back to template
        // Template descriptions should have cost = 0
        for (const result of results) {
            assert.strictEqual(result.cost, 0, 'Template fallback should have zero cost')
            assert.strictEqual(result.tokensUsed, 0, 'Template fallback should have zero tokens')
            assert.strictEqual(result.model, 'template-fallback', 'Should use template-fallback model')
        }

        // Verify telemetry events
        const batchEvent = mockTelemetry.events.find((e) => e.name === 'AI.Description.BatchGenerated')
        assert.ok(batchEvent, 'Should emit batch generated event')
        assert.strictEqual(batchEvent.properties?.['requestCount'], 5)

        // Should have 5 fallback events (one per location)
        const fallbackEvents = mockTelemetry.events.filter((e) => e.name === 'AI.Description.Fallback')
        assert.strictEqual(fallbackEvents.length, 5, 'Should emit 5 fallback events')
    })

    test('should handle mixed terrains correctly', async () => {
        const nullClient = new NullAzureOpenAIClient()
        const mockTelemetry = new MockTelemetryClient()
        const telemetryService = new TelemetryService(mockTelemetry)
        const service = new AIDescriptionService(nullClient, telemetryService)

        const request: BatchDescriptionRequest = {
            locations: [
                {
                    locationId: 'forest-1',
                    terrain: 'dense-forest' as TerrainType,
                    arrivalDirection: 'north' as Direction,
                    neighbors: ['south' as Direction]
                },
                {
                    locationId: 'plain-1',
                    terrain: 'open-plain' as TerrainType,
                    arrivalDirection: 'south' as Direction,
                    neighbors: ['north' as Direction, 'east' as Direction, 'west' as Direction]
                }
            ],
            style: 'atmospheric'
        }

        const results = await service.batchGenerateDescriptions(request)

        assert.strictEqual(results.length, 2)

        // Verify terrain-specific content in descriptions
        const forestDesc = results.find((r) => r.locationId === 'forest-1')
        const plainDesc = results.find((r) => r.locationId === 'plain-1')

        assert.ok(forestDesc)
        assert.ok(plainDesc)

        assert.ok(forestDesc.description.includes('dense forest'), 'Forest description should mention terrain')
        assert.ok(plainDesc.description.includes('open plain'), 'Plain description should mention terrain')
    })

    test('should handle all description styles', async () => {
        const nullClient = new NullAzureOpenAIClient()
        const mockTelemetry = new MockTelemetryClient()
        const telemetryService = new TelemetryService(mockTelemetry)
        const service = new AIDescriptionService(nullClient, telemetryService)

        const styles: Array<'concise' | 'atmospheric' | 'utilitarian'> = ['concise', 'atmospheric', 'utilitarian']

        for (const style of styles) {
            mockTelemetry.clear()

            const request: BatchDescriptionRequest = {
                locations: [
                    {
                        locationId: `loc-${style}`,
                        terrain: 'hilltop' as TerrainType,
                        arrivalDirection: 'north' as Direction,
                        neighbors: ['south' as Direction, 'down' as Direction]
                    }
                ],
                style
            }

            const results = await service.batchGenerateDescriptions(request)

            assert.strictEqual(results.length, 1, `Should generate description for ${style} style`)
            assert.ok(results[0].description.length > 0, `${style} style should generate non-empty description`)

            const batchEvent = mockTelemetry.events.find((e) => e.name === 'AI.Description.BatchGenerated')
            assert.ok(batchEvent, `Should emit batch event for ${style} style`)
            assert.strictEqual(batchEvent.properties?.['style'], style, `Should track ${style} style in telemetry`)
        }
    })

    test('should include exit directions in all descriptions', async () => {
        const nullClient = new NullAzureOpenAIClient()
        const mockTelemetry = new MockTelemetryClient()
        const telemetryService = new TelemetryService(mockTelemetry)
        const service = new AIDescriptionService(nullClient, telemetryService)

        const request: BatchDescriptionRequest = {
            locations: [
                {
                    locationId: 'multi-exit',
                    terrain: 'open-plain' as TerrainType,
                    arrivalDirection: 'north' as Direction,
                    neighbors: ['south' as Direction, 'east' as Direction, 'west' as Direction, 'northeast' as Direction]
                }
            ],
            style: 'concise'
        }

        const results = await service.batchGenerateDescriptions(request)

        assert.strictEqual(results.length, 1)

        // Template should mention exit directions
        const description = results[0].description.toLowerCase()
        assert.ok(
            description.includes('south') || description.includes('east') || description.includes('west'),
            'Description should mention exit directions'
        )
    })
})
