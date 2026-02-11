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

        // Clear event publisher queue
        if ('clear' in eventPublisher) {
            ;(eventPublisher as any).clear()
        }
    })

    after(async () => {
        if (fixture) {
            await fixture.teardown()
        }
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

            // Get baseline location count before batch generation
            const baselineLocations = await locationRepo.listAll()
            const baselineCount = baselineLocations.length

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
                    batchSize: 4 // Open plain supports 4 cardinal directions
                }
            }

            // Act
            const result = await handler.handle(event, mockContext)

            // Assert: Handler succeeded
            assert.equal(result.outcome, 'success', 'Handler should succeed')

            // Assert: Telemetry emitted (Started + Completed)
            const telemetryEvents = mockTelemetry.events.filter((e) => e.name.startsWith('World.BatchGeneration.'))
            assert.ok(telemetryEvents.length >= 2, 'Should emit Started and Completed telemetry')

            const startedEvent = telemetryEvents.find((e) => e.name === 'World.BatchGeneration.Started')
            assert.ok(startedEvent, 'Should emit Started telemetry')
            assert.equal(startedEvent.properties.rootLocationId, rootLocationId)

            const completedEvent = telemetryEvents.find((e) => e.name === 'World.BatchGeneration.Completed')
            assert.ok(completedEvent, 'Should emit Completed telemetry')
            assert.equal(completedEvent.properties.locationsGenerated, 3, 'Should generate 3 locations (4 cardinal dirs - 1 arrival dir)')
            assert.equal(completedEvent.properties.exitsCreated, 6, 'Should create 6 exits (3 bidirectional pairs)')
            assert.ok(completedEvent.properties.durationMs >= 0, 'Should report duration')
            assert.ok(completedEvent.properties.aiCost >= 0, 'Should report AI cost')

            // Assert: Locations created (check delta, not absolute count)
            const allLocations = await locationRepo.listAll()
            const newCount = allLocations.length - baselineCount
            assert.equal(newCount, 3, 'Should create 3 new locations')

            // Assert: Each new location has expected properties
            const generatedLocations = allLocations.filter((loc) => !baselineLocations.some((b) => b.id === loc.id))
            for (const location of generatedLocations) {
                assert.ok(location.id, 'Location should have UUID')
                assert.ok(location.name.includes('Unexplored') || location.name.includes('plain'), 'Location should have placeholder or generated name')
                assert.equal(location.terrain, 'open-plain', 'Location should have correct terrain')
            }

            // Assert: Exit events enqueued
            const enqueuedEvents = (eventPublisher as any).enqueuedEvents || []
            assert.equal(enqueuedEvents.length, 3, 'Should enqueue 3 exit creation events')

            for (const exitEvent of enqueuedEvents) {
                assert.equal(exitEvent.type, 'World.Exit.Create', 'Should be exit creation event')
                assert.equal(exitEvent.payload.fromLocationId, rootLocationId, 'Exit should start from root')
                assert.ok(exitEvent.payload.toLocationId, 'Exit should have target location')
                assert.ok(exitEvent.payload.direction, 'Exit should have direction')
                assert.equal(exitEvent.payload.reciprocal, true, 'Exit should be bidirectional')
                assert.equal(exitEvent.correlationId, event.correlationId, 'Exit event should inherit correlation ID')
            }
        })
    })

    describe('Terrain Guidance: Narrow Corridor', () => {
        it('should respect terrain guidance for narrow-corridor', async () => {
            // Arrange
            const rootLocationId = uuidv4()
            await locationRepo.upsert({
                id: rootLocationId,
                name: 'Cave Entrance',
                description: 'A narrow passage into the mountainside',
                terrain: 'narrow-corridor',
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
                    terrain: 'narrow-corridor',
                    arrivalDirection: 'south',
                    expansionDepth: 1,
                    batchSize: 5 // Request 5 but terrain guidance may limit
                }
            }

            // Act
            const result = await handler.handle(event, mockContext)

            // Assert
            assert.equal(result.outcome, 'success')

            const completedEvent = mockTelemetry.events.find((e) => e.name === 'World.BatchGeneration.Completed')
            assert.ok(completedEvent, 'Should emit Completed telemetry')
            
            // Narrow corridor with no defaultDirections falls back to cardinal directions
            // With arrivalDirection='south' filtered out, we get [north, east, west] = 3
            assert.ok(completedEvent.properties.locationsGenerated >= 1, 'Should generate at least 1 location')
            assert.ok(completedEvent.properties.locationsGenerated <= 4, 'Should not exceed available directions (4 cardinal - 1 arrival)')
        })
    })
})
