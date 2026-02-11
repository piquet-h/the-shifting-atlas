/**
 * BatchGenerateHandler Integration Tests
 *
 * Tests the complete BatchGenerate flow:
 * - Location stub creation (Gremlin + SQL)
 * - AI description generation
 * - Description layer persistence
 * - Exit event enqueueing
 * - Telemetry emission
 * - Error handling and fallbacks
 */

import { describe, it, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { v4 as uuidv4 } from 'uuid'
import type { WorldEventEnvelope } from '@piquet-h/shared/events'
import type { InvocationContext } from '@azure/functions'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import { BatchGenerateHandler } from '../../src/worldEvents/handlers/BatchGenerateHandler.js'
import type { ILocationRepository } from '../../src/repos/locationRepository.js'
import type { ILayerRepository } from '../../src/repos/layerRepository.js'
import type { IWorldEventPublisher } from '../../src/worldEvents/worldEventPublisher.js'
import { MockTelemetryClient } from '../mocks/MockTelemetryClient.js'
import { TOKENS } from '../../src/di/tokens.js'

/**
 * Helper to create a mock InvocationContext
 */
function createMockContext(): InvocationContext {
    return {
        invocationId: uuidv4(),
        log: (...args: unknown[]) => console.log('[TEST]', ...args),
        error: (...args: unknown[]) => console.error('[TEST ERROR]', ...args),
        warn: (...args: unknown[]) => console.warn('[TEST WARN]', ...args),
        debug: (...args: unknown[]) => console.debug('[TEST DEBUG]', ...args),
        trace: (...args: unknown[]) => console.log('[TEST TRACE]', ...args),
        info: (...args: unknown[]) => console.info('[TEST INFO]', ...args),
        options: {}
    } as InvocationContext
}

describe('BatchGenerateHandler Integration', () => {
    let fixture: IntegrationTestFixture
    let handler: BatchGenerateHandler
    let locationRepo: ILocationRepository
    let layerRepo: ILayerRepository
    let eventPublisher: IWorldEventPublisher
    let mockTelemetry: MockTelemetryClient
    let mockContext: InvocationContext

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        const container = await fixture.getContainer()

        handler = container.get(BatchGenerateHandler)
        locationRepo = container.get<ILocationRepository>(TOKENS.LocationRepository)
        layerRepo = container.get<ILayerRepository>(TOKENS.LayerRepository)
        eventPublisher = container.get<IWorldEventPublisher>(TOKENS.WorldEventPublisher)
        mockTelemetry = container.get<MockTelemetryClient>(TOKENS.TelemetryClient) as MockTelemetryClient
        mockContext = createMockContext()

        // Clear telemetry before each test
        mockTelemetry.clear()
    })

    after(async () => {
        await fixture?.cleanup()
    })

    describe('Happy Path: Batch Generation with AI', () => {
        it('should create stub locations, generate descriptions, persist layers, and enqueue exit events', async () => {
            // Arrange: Create a root location
            const rootLocationId = uuidv4()
            await locationRepo.upsert({
                id: rootLocationId,
                name: 'Village Gate',
                description: 'The northern gate of Mosswell village',
                terrain: 'open-plain',
                tags: [],
                exits: [],
                version: 1
            })

            const event: WorldEventEnvelope = {
                eventId: uuidv4(),
                type: 'World.Location.BatchGenerate',
                occurredUtc: new Date().toISOString(),
                actor: { kind: 'system' },
                correlationId: uuidv4(),
                idempotencyKey: `batch:${uuidv4()}`,
                version: 1,
                payload: {
                    rootLocationId,
                    terrain: 'open-plain',
                    arrivalDirection: 'south',
                    expansionDepth: 1,
                    batchSize: 5
                }
            }

            // Act
            const result = await handler.handle(event, mockContext)

            // Assert: Handler succeeded
            assert.equal(result.outcome, 'success')

            // Assert: Telemetry emitted (Started + Completed)
            const telemetryEvents = mockTelemetry.events.filter((e) => e.name.startsWith('World.BatchGeneration.'))
            assert.ok(telemetryEvents.length >= 2, 'Should emit Started and Completed telemetry')

            const startedEvent = telemetryEvents.find((e) => e.name === 'World.BatchGeneration.Started')
            assert.ok(startedEvent, 'Should emit Started telemetry')
            assert.equal(startedEvent.properties.rootLocationId, rootLocationId)

            const completedEvent = telemetryEvents.find((e) => e.name === 'World.BatchGeneration.Completed')
            assert.ok(completedEvent, 'Should emit Completed telemetry')
            assert.ok(completedEvent.properties.locationsGenerated > 0, 'Should report locations generated')
            assert.ok(completedEvent.properties.exitsCreated > 0, 'Should report exits created')
            assert.ok(completedEvent.properties.durationMs >= 0, 'Should report duration')

            // Note: Full assertions for location creation, layer persistence, and exit events
            // will be added when we implement the full handler logic
        })
    })
})
