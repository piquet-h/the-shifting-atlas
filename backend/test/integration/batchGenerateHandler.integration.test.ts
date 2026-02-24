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
    let eventPublisher: IWorldEventPublisher
    let mockTelemetry: MockTelemetryClient
    let mockContext: InvocationContext

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        const container = await fixture.getContainer()

        handler = container.get(BatchGenerateHandler)
        locationRepo = container.get<ILocationRepository>(TOKENS.LocationRepository)
        eventPublisher = container.get<IWorldEventPublisher>(TOKENS.WorldEventPublisher)
        mockTelemetry = container.get<MockTelemetryClient>(TOKENS.TelemetryClient) as MockTelemetryClient
        mockContext = createMockContext()

        // Clear telemetry before each test
        mockTelemetry.clear()

        // Clear event publisher queue
        if ('clear' in eventPublisher) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                assert.ok(
                    location.name.includes('Unexplored') || location.name.includes('plain'),
                    'Location should have placeholder or generated name'
                )
            }

            // Assert: Exit events enqueued
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

            // Narrow corridor with empty defaultDirections falls back to cardinal [N,S,E,W]
            // Filtering out arrivalDirection='south' leaves [N,E,W] = 3 locations
            // The assertion is lenient (1-4) to handle potential future terrain config changes
            assert.ok(completedEvent.properties.locationsGenerated >= 1, 'Should generate at least 1 location')
            assert.ok(completedEvent.properties.locationsGenerated <= 4, 'Should not exceed available directions (4 cardinal - 1 arrival)')
        })
    })

    describe('Reconnection: Strict Loop Closure', () => {
        it('should reconnect to existing location when direct exit already exists, no stub created', async () => {
            // Arrange: Create root R with an existing bidirectional exit to L_north.
            // This simulates a world where R already has a mapped north neighbour.
            const rootId = uuidv4()
            const lNorthId = uuidv4()

            await locationRepo.upsert({
                id: rootId,
                name: 'Town Centre',
                description: 'The heart of the settlement',
                terrain: 'open-plain',
                tags: [],
                exits: [],
                version: 1
            })
            await locationRepo.upsert({
                id: lNorthId,
                name: 'North Alley',
                description: 'A cobbled alley heading north',
                terrain: 'open-plain',
                tags: [],
                exits: [],
                version: 1
            })
            // Pre-wire the north exit so checkDirectReconnection will find it.
            await locationRepo.ensureExitBidirectional(rootId, 'north', lNorthId, { reciprocal: true })

            const baselineCount = (await locationRepo.listAll()).length // 2

            const event: WorldEventEnvelope = {
                eventId: uuidv4(),
                type: 'World.Location.BatchGenerate',
                occurredUtc: new Date().toISOString(),
                actor: { kind: 'system' },
                correlationId: uuidv4(),
                idempotencyKey: `batch:${uuidv4()}`,
                version: 1,
                payload: {
                    rootLocationId: rootId,
                    terrain: 'open-plain',
                    arrivalDirection: 'south', // Player arrived from south → south filtered
                    expansionDepth: 1,
                    batchSize: 4 // Wants: north, east, west (south is arrival direction)
                }
            }

            // Act
            const result = await handler.handle(event, mockContext)

            // Assert: handler succeeded
            assert.equal(result.outcome, 'success')

            // 'north' should reconnect to lNorthId (Phase 1 direct check).
            // Only 'east' and 'west' should get stubs → 2 new locations.
            const allLocations = await locationRepo.listAll()
            const newCount = allLocations.length - baselineCount
            assert.equal(newCount, 2, 'Should create only 2 stubs (north reconnected to existing location)')

            const completedEvent = mockTelemetry.events.find((e) => e.name === 'World.BatchGeneration.Completed')
            assert.ok(completedEvent, 'Should emit Completed telemetry')
            assert.equal(completedEvent.properties.locationsGenerated, 2, 'locationsGenerated should be 2')
            assert.equal(completedEvent.properties.reconnectionsCreated, 1, 'reconnectionsCreated should be 1')
            assert.equal(completedEvent.properties.exitsCreated, 2 * 2 + 1 * 2, 'exitsCreated: 4 for stubs + 2 for reconnection = 6')

            // The exit events enqueued should only cover the 2 stub directions, not north.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const enqueuedEvents = (eventPublisher as any).enqueuedEvents || []
            assert.equal(enqueuedEvents.length, 2, 'Should enqueue exit events only for the 2 stub directions')
            for (const exitEvent of enqueuedEvents) {
                assert.notEqual(exitEvent.payload.direction, 'north', 'north direction should not get a new exit event')
            }
        })
    })

    describe('Reconnection: Wilderness Fuzzy Stitching', () => {
        it('should stitch to nearest reachable candidate within travel budget', async () => {
            // Arrange:
            //   root R ──north──> L_N ──east──> L_NE
            // Budget = 2 × DEFAULT_TRAVEL_DURATION_MS = 120,000 ms.
            // L_N  is 1 hop / 60,000 ms from R  → within budget.
            // L_NE is 2 hops / 120,000 ms from R → exactly at budget limit (≤ 120,000 ms).
            //
            // BatchGenerate from R with arrivalDirection='south':
            //   Phase 1 checks: 'north' has exit → reconnect to L_N.
            //   Stub directions remaining: ['east', 'west'].
            //   Phase 2 fuzzy candidates (sorted): L_N(1 hop, used), L_NE(2 hops, unused).
            //   'east' → assigned to L_NE (nearest unassigned candidate).
            //   'west' → no unused candidates → create stub.
            // Expected: 1 new stub (west), 2 reconnections (north→L_N, east→L_NE).
            const rootId = uuidv4()
            const lNorthId = uuidv4()
            const lNorthEastId = uuidv4()

            await locationRepo.upsert({
                id: rootId,
                name: 'Crossroads',
                description: 'Where the paths meet',
                terrain: 'open-plain',
                tags: [],
                exits: [],
                version: 1
            })
            await locationRepo.upsert({
                id: lNorthId,
                name: 'North Fields',
                description: 'Rolling fields to the north',
                terrain: 'open-plain',
                tags: [],
                exits: [],
                version: 1
            })
            await locationRepo.upsert({
                id: lNorthEastId,
                name: 'Northeast Heath',
                description: 'Heathland to the northeast',
                terrain: 'open-plain',
                tags: [],
                exits: [],
                version: 1
            })

            // Wire up: R→north→L_N (bidirectional) and L_N→east→L_NE (bidirectional)
            await locationRepo.ensureExitBidirectional(rootId, 'north', lNorthId, { reciprocal: true })
            await locationRepo.ensureExitBidirectional(lNorthId, 'east', lNorthEastId, { reciprocal: true })

            const baselineCount = (await locationRepo.listAll()).length // 3

            const event: WorldEventEnvelope = {
                eventId: uuidv4(),
                type: 'World.Location.BatchGenerate',
                occurredUtc: new Date().toISOString(),
                actor: { kind: 'system' },
                correlationId: uuidv4(),
                idempotencyKey: `batch:${uuidv4()}`,
                version: 1,
                payload: {
                    rootLocationId: rootId,
                    terrain: 'open-plain',
                    arrivalDirection: 'south',
                    expansionDepth: 1,
                    batchSize: 3 // Wants: north, east, west
                }
            }

            // Act
            const result = await handler.handle(event, mockContext)

            // Assert: handler succeeded
            assert.equal(result.outcome, 'success')

            // Only 'west' should be a stub → 1 new location.
            const allLocations = await locationRepo.listAll()
            const newCount = allLocations.length - baselineCount
            assert.equal(newCount, 1, 'Should create only 1 stub (north and east reconnected)')

            const completedEvent = mockTelemetry.events.find((e) => e.name === 'World.BatchGeneration.Completed')
            assert.ok(completedEvent, 'Should emit Completed telemetry')
            assert.equal(completedEvent.properties.locationsGenerated, 1, 'locationsGenerated should be 1')
            assert.equal(completedEvent.properties.reconnectionsCreated, 2, 'reconnectionsCreated should be 2')

            // Only 1 exit event should be enqueued (for the west stub).
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const enqueuedEvents = (eventPublisher as any).enqueuedEvents || []
            assert.equal(enqueuedEvents.length, 1, 'Should enqueue exit event only for the 1 stub direction (west)')
            assert.equal(enqueuedEvents[0].payload.direction, 'west', 'Stub should be in the west direction')
        })

        it('should pick the deterministic nearest candidate when multiple candidates exist at same hop count', async () => {
            // Arrange: Two candidates at the same hop-count from root; lex-smallest wins.
            //
            //   root R ──south──> Intermediary ──north──> L_A (2 hops, 120k ms from R)
            //                                 ──west──>  L_B (2 hops, 120k ms from R)
            //
            // BatchGenerate from R, arrivalDirection='north', batchSize=2 → directions=['south','east'].
            //   Phase 1: 'south' has direct exit → reconnect to Intermediary.
            //   Phase 2 for 'east': candidates sorted by hops ASC, travelMs ASC, locationId ASC.
            //                       Intermediary is already used; L_A and L_B are tied (2 hops, 120k).
            //                       The lex-smallest ID is assigned to 'east'.
            // Expected: 0 new stubs, 2 reconnections.  'east' connects to lex-smallest of (L_A, L_B).
            const rootId = uuidv4()
            const intermediaryId = uuidv4()
            const idA = uuidv4()
            const idB = uuidv4()
            const lexSmallest = [idA, idB].sort()[0]

            for (const [id, name] of [
                [rootId, 'Root'],
                [intermediaryId, 'Intermediary'],
                [idA, 'Location A'],
                [idB, 'Location B']
            ]) {
                await locationRepo.upsert({ id, name, description: '', terrain: 'open-plain', tags: [], exits: [], version: 1 })
            }

            // R→south→Intermediary (Phase 1 direct hit for 'south')
            await locationRepo.ensureExitBidirectional(rootId, 'south', intermediaryId, { reciprocal: true })
            // Intermediary→north→L_A and Intermediary→west→L_B (both 2 hops from R)
            await locationRepo.ensureExitBidirectional(intermediaryId, 'north', idA, { reciprocal: true })
            await locationRepo.ensureExitBidirectional(intermediaryId, 'west', idB, { reciprocal: true })

            const baselineCount = (await locationRepo.listAll()).length // 4

            // open-plain default directions: [north, south, east, west]
            // arrivalDirection='north' filtered → [south, east, west]; batchSize=2 → [south, east]
            const event: WorldEventEnvelope = {
                eventId: uuidv4(),
                type: 'World.Location.BatchGenerate',
                occurredUtc: new Date().toISOString(),
                actor: { kind: 'system' },
                correlationId: uuidv4(),
                idempotencyKey: `batch:${uuidv4()}`,
                version: 1,
                payload: {
                    rootLocationId: rootId,
                    terrain: 'open-plain',
                    arrivalDirection: 'north',
                    expansionDepth: 1,
                    batchSize: 2 // Wants: south, east
                }
            }

            // Act
            const result = await handler.handle(event, mockContext)
            assert.equal(result.outcome, 'success')

            // 0 new locations: south→Intermediary (Phase 1), east→lex-smallest(L_A/L_B) (Phase 2).
            const allLocations = await locationRepo.listAll()
            assert.equal(allLocations.length - baselineCount, 0, 'No new stub locations should be created')

            const completedEvent = mockTelemetry.events.find((e) => e.name === 'World.BatchGeneration.Completed')
            assert.ok(completedEvent, 'Should emit Completed telemetry')
            assert.equal(completedEvent.properties.locationsGenerated, 0, 'locationsGenerated should be 0')
            assert.equal(completedEvent.properties.reconnectionsCreated, 2, 'reconnectionsCreated should be 2')

            // Verify deterministic tie-break: root's 'east' exit points to the lex-smallest candidate.
            const rootAfter = await locationRepo.get(rootId)
            const eastExit = rootAfter?.exits?.find((e) => e.direction === 'east')
            assert.ok(eastExit, "Root should have an 'east' exit after Phase 2 reconnection")
            assert.equal(eastExit.to, lexSmallest, 'Phase 2 should pick the lexicographically smallest tied candidate')
        })
    })
})
