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

import type { InvocationContext } from '@azure/functions'
import { getOppositeDirection, type Direction } from '@piquet-h/shared'
import type { WorldEventEnvelope } from '@piquet-h/shared/events'
import assert from 'node:assert/strict'
import { after, beforeEach, describe, it } from 'node:test'
import { v4 as uuidv4 } from 'uuid'
import { TOKENS } from '../../src/di/tokens.js'
import type { ILocationRepository } from '../../src/repos/locationRepository.js'
import { BatchGenerateHandler } from '../../src/worldEvents/handlers/BatchGenerateHandler.js'
import type { IWorldEventPublisher } from '../../src/worldEvents/worldEventPublisher.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import { MockTelemetryClient } from '../mocks/MockTelemetryClient.js'

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

            // Assert: stub locations are frontier-expandable by default (pending exits)
            // so look/prefetch can surface additional exits immediately.
            for (const exitEvent of enqueuedEvents) {
                const stubId = exitEvent.payload.toLocationId as string
                const dirFromRoot = exitEvent.payload.direction as string

                const stub = await locationRepo.get(stubId)
                assert.ok(stub, 'Stub location should exist')

                const pending = stub.exitAvailability?.pending
                assert.ok(pending, 'Stub should have exitAvailability.pending configured')

                const backDir = getOppositeDirection(dirFromRoot)
                assert.ok(
                    !(backDir in pending!),
                    'Stub should not mark the reciprocal (back) direction as pending because a hard exit will exist there'
                )

                // open-plain defaultDirections are cardinal; stubs should expose the other 3 as pending.
                const pendingKeys = Object.keys(pending!)
                assert.equal(pendingKeys.length, 3, 'Open-plain stub should expose 3 pending exits (cardinal minus back direction)')
            }

            // Assert: base description layer prose uses correct arrival direction semantics.
            // Contract: arrivalDirection is the direction the player arrived FROM.
            // If the player travels `north` from root to stub, they arrive at the stub from `south`.
            const layerRepo = await fixture.getLayerRepository()
            for (const exitEvent of enqueuedEvents) {
                const stubId = exitEvent.payload.toLocationId as string
                const dirFromRoot = exitEvent.payload.direction as string
                const backDir = getOppositeDirection(dirFromRoot as Direction)

                const baseLayer = await layerRepo.getActiveLayerForLocation(stubId, 'base', 0)
                assert.ok(baseLayer, 'Stub should have a base description layer persisted')
                assert.ok(
                    baseLayer.value.includes(`You arrive from ${backDir}`),
                    `Stub base prose should say "You arrive from ${backDir}" (got: ${baseLayer.value})`
                )
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
        it('should allow near-west travel-weighted candidate for west expansion', async () => {
            // Narrative consistency should be tolerant, not exact:
            // a path that is mostly westward (e.g., west(9) with small drift) is acceptable
            // for a requested west expansion.
            const rootId = uuidv4()
            const northId = uuidv4()
            const eastId = uuidv4()
            const southPivotId = uuidv4()
            const westCandidateId = uuidv4()

            await locationRepo.upsert({
                id: rootId,
                name: 'Crossroads Root',
                description: 'Root location',
                terrain: 'open-plain',
                tags: [],
                exits: [],
                version: 1
            })
            await locationRepo.upsert({
                id: northId,
                name: 'North',
                description: '',
                terrain: 'open-plain',
                tags: [],
                exits: [],
                version: 1
            })
            await locationRepo.upsert({ id: eastId, name: 'East', description: '', terrain: 'open-plain', tags: [], exits: [], version: 1 })
            await locationRepo.upsert({
                id: southPivotId,
                name: 'South Pivot',
                description: '',
                terrain: 'open-plain',
                tags: [],
                exits: [],
                version: 1
            })
            await locationRepo.upsert({
                id: westCandidateId,
                name: 'Mostly West Candidate',
                description: '',
                terrain: 'open-plain',
                tags: [],
                exits: [],
                version: 1
            })

            // Direct exits consumed by Phase 1 for north/east.
            await locationRepo.ensureExitBidirectional(rootId, 'north', northId, { reciprocal: true })
            await locationRepo.ensureExitBidirectional(rootId, 'east', eastId, { reciprocal: true })

            // Westward candidate reachable via slight drift: south(2) then west(9).
            // Travel-weighted heading is still strongly westward.
            await locationRepo.ensureExitBidirectional(rootId, 'south', southPivotId, { reciprocal: true })
            await locationRepo.ensureExitBidirectional(southPivotId, 'west', westCandidateId, { reciprocal: true })
            await locationRepo.setExitTravelDuration(rootId, 'south', 2_000)
            await locationRepo.setExitTravelDuration(southPivotId, 'west', 9_000)

            const baselineCount = (await locationRepo.listAll()).length

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
                    batchSize: 3
                }
            }

            const result = await handler.handle(event, mockContext)
            assert.equal(result.outcome, 'success')

            const rootAfter = await locationRepo.get(rootId)
            assert.ok(rootAfter)

            const westExit = rootAfter.exits?.find((e) => e.direction === 'west')
            assert.ok(westExit, 'Root should gain west reconnection')
            assert.equal(westExit?.to, westCandidateId, 'West expansion should reconnect to near-west candidate')

            const allLocations = await locationRepo.listAll()
            assert.equal(allLocations.length - baselineCount, 0, 'Should reconnect all directions without creating stubs')

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const enqueuedEvents = (eventPublisher as any).enqueuedEvents || []
            assert.equal(enqueuedEvents.length, 0, 'No stub exit events expected when all directions reconnect')
        })

        it('should not fuzzy-reconnect frontier boundary exits back into existing reachable graph', async () => {
            // Regression (2026-02-27): frontier boundaries (e.g., North Gate) could gain
            // a pending "north" exit that stitched back to an interior settlement node
            // (such as the starter hub), creating a jarring navigation loop.
            //
            // Expectation: frontier boundary roots should expand outward with stubs for
            // unresolved pending directions rather than fuzzy-stitching to already
            // reachable locations.
            const rootId = uuidv4()
            const interiorId = uuidv4()
            const intermediateId = uuidv4()

            await locationRepo.upsert({
                id: rootId,
                name: 'North Gate',
                description: 'A rough gate at the edge of town',
                terrain: 'open-plain',
                tags: ['frontier:boundary'],
                exits: [],
                version: 1
            })

            await locationRepo.upsert({
                id: intermediateId,
                name: 'North Road',
                description: 'Road between gate and town',
                terrain: 'open-plain',
                tags: [],
                exits: [],
                version: 1
            })

            await locationRepo.upsert({
                id: interiorId,
                name: 'Mosswell River Jetty',
                description: 'Interior settlement hub',
                terrain: 'open-plain',
                tags: [],
                exits: [],
                version: 1
            })

            // Existing reachable path from root to interior: root -> intermediate -> interior.
            await locationRepo.ensureExitBidirectional(rootId, 'south', intermediateId, { reciprocal: true })
            await locationRepo.ensureExitBidirectional(intermediateId, 'south', interiorId, { reciprocal: true })

            const baselineCount = (await locationRepo.listAll()).length

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
                    batchSize: 1
                }
            }

            const result = await handler.handle(event, mockContext)
            assert.equal(result.outcome, 'success')

            const rootAfter = await locationRepo.get(rootId)
            assert.ok(rootAfter, 'Root location should exist')

            const northExit = rootAfter.exits?.find((e) => e.direction === 'north')
            assert.ok(!northExit, 'Frontier north expansion should remain a stub candidate (not immediate hard reconnection)')

            const allLocations = await locationRepo.listAll()
            assert.equal(allLocations.length - baselineCount, 1, 'Should create one new stub location for north expansion')

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const enqueuedEvents = (eventPublisher as any).enqueuedEvents || []
            assert.equal(enqueuedEvents.length, 1, 'Should enqueue one exit creation event for frontier stub expansion')
            assert.equal(enqueuedEvents[0].payload.direction, 'north')
        })

        it('should not reconnect to a directly adjacent location via a new direction (avoid duplicate adjacency)', async () => {
            // Regression (2026-02-27): North Gate gained a newly-generated 'north' exit
            // that pointed back to the already-adjacent Stone Circle Shrine (via southwest).
            // This happens when Phase 2 fuzzy stitching selects an already-adjacent location
            // as the nearest candidate. That produces confusing navigation (north == southwest).
            //
            // Expectation: Phase 2 must exclude locations that are already directly adjacent
            // (reachable in 1 hop from root), so new directions either create stubs or stitch
            // to genuinely new (non-adjacent) candidates.
            const rootId = uuidv4()
            const shrineId = uuidv4()

            await locationRepo.upsert({
                id: rootId,
                name: 'North Gate',
                description: 'A rough gate at the edge of town',
                terrain: 'open-plain',
                tags: [],
                exits: [],
                version: 1
            })
            await locationRepo.upsert({
                id: shrineId,
                name: 'Stone Circle Shrine',
                description: 'Standing stones in a ring',
                terrain: 'open-plain',
                tags: [],
                exits: [],
                version: 1
            })

            // Root already has a direct neighbor (shrine) via a non-north direction.
            await locationRepo.ensureExitBidirectional(rootId, 'southwest', shrineId, { reciprocal: true })

            const baselineCount = (await locationRepo.listAll()).length // 2

            // open-plain default directions: [north, south, east, west]
            // arrivalDirection='south' filtered → [north, east, west]
            // batchSize=1 → only 'north' is considered.
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
                    batchSize: 1
                }
            }

            const result = await handler.handle(event, mockContext)
            assert.equal(result.outcome, 'success')

            const rootAfter = await locationRepo.get(rootId)
            assert.ok(rootAfter, 'Root location should exist')

            const northExit = rootAfter.exits?.find((e) => e.direction === 'north')
            assert.ok(
                !northExit || northExit.to !== shrineId,
                "Root's 'north' direction must not be reconnected to an already-adjacent location"
            )

            // Because the only candidate was a direct neighbor, it should not be used for reconnection;
            // instead a stub is created → +1 location.
            const allLocations = await locationRepo.listAll()
            assert.equal(allLocations.length - baselineCount, 1, 'Should create a stub location for north (no reconnection)')

            // And exactly one exit-create event should be enqueued (for that stub).
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const enqueuedEvents = (eventPublisher as any).enqueuedEvents || []
            assert.equal(enqueuedEvents.length, 1, 'Should enqueue one exit creation event for the stub')
            assert.equal(enqueuedEvents[0].type, 'World.Exit.Create')
            assert.equal(enqueuedEvents[0].payload.direction, 'north')
        })

        it('should not reconnect a cardinal direction to a primarily diagonal (e.g. southwest) candidate', async () => {
            // Regression (2026-03-01): A generated stub north of North Gate gained a `west` exit
            // that stitched to Stone Circle Shrine, even though the shrine is reached by travelling
            // south then southwest (i.e. primarily southwest from the stub, not west).
            //
            // Expectation: Wilderness fuzzy stitching should only use a candidate when the candidate's
            // displacement is best-aligned with the requested direction, not merely above a permissive
            // cosine threshold.
            const stubId = uuidv4()
            const gateId = uuidv4()
            const shrineId = uuidv4()

            await locationRepo.upsert({
                id: stubId,
                name: 'Unexplored Open Plain',
                description: '',
                terrain: 'open-plain',
                tags: [],
                exits: [],
                version: 1
            })
            await locationRepo.upsert({
                id: gateId,
                name: 'North Gate',
                description: 'A rough gate at the edge of town',
                terrain: 'open-plain',
                tags: [],
                exits: [],
                version: 1
            })
            await locationRepo.upsert({
                id: shrineId,
                name: 'Stone Circle Shrine',
                description: 'Standing stones in a ring',
                terrain: 'open-plain',
                tags: [],
                exits: [],
                version: 1
            })

            // Stub is north of gate; shrine is southwest of gate.
            await locationRepo.ensureExitBidirectional(stubId, 'south', gateId, { reciprocal: true })
            await locationRepo.ensureExitBidirectional(gateId, 'southwest', shrineId, { reciprocal: true })

            const baselineCount = (await locationRepo.listAll()).length // 3

            // open-plain default directions: [north, south, east, west]
            // arrivalDirection='south' filtered → [north, east, west]
            const event: WorldEventEnvelope = {
                eventId: uuidv4(),
                type: 'World.Location.BatchGenerate',
                occurredUtc: new Date().toISOString(),
                actor: { kind: 'system' },
                correlationId: uuidv4(),
                idempotencyKey: `batch:${uuidv4()}`,
                version: 1,
                payload: {
                    rootLocationId: stubId,
                    terrain: 'open-plain',
                    arrivalDirection: 'south',
                    expansionDepth: 1,
                    batchSize: 3
                }
            }

            const result = await handler.handle(event, mockContext)
            assert.equal(result.outcome, 'success')

            const stubAfter = await locationRepo.get(stubId)
            assert.ok(stubAfter)

            const westExit = stubAfter.exits?.find((e) => e.direction === 'west')
            assert.ok(!westExit || westExit.to !== shrineId, "Stub 'west' must not stitch to a primarily southwest candidate")

            // With no valid reconnection candidates for cardinal directions, all 3 directions should become stubs.
            const allLocations = await locationRepo.listAll()
            assert.equal(allLocations.length - baselineCount, 3, 'Should create 3 stub locations (north/east/west)')

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const enqueuedEvents = (eventPublisher as any).enqueuedEvents || []
            assert.equal(enqueuedEvents.length, 3, 'Should enqueue 3 exit creation events (one per stub)')
            assert.ok(
                enqueuedEvents.every((e) => e.type === 'World.Exit.Create'),
                'All enqueued events should be World.Exit.Create'
            )
        })

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

        it('should pick the deterministic nearest aligned candidate when multiple candidates exist at same hop count', async () => {
            // Arrange: Two EAST-eligible candidates at the same hop-count from root; lex-smallest wins.
            //
            //   root R ──south──> Intermediary ──northeast──> L_A (2 hops, 120k ms from R)
            //                                 ──east───────> L_B (2 hops, 120k ms from R)
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
            // Intermediary→northeast→L_A and Intermediary→east→L_B (both 2 hops from R)
            await locationRepo.ensureExitBidirectional(intermediaryId, 'northeast', idA, { reciprocal: true })
            await locationRepo.ensureExitBidirectional(intermediaryId, 'east', idB, { reciprocal: true })

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

    describe('Reconnection: ms-Aligned Travel Durations (300k ms)', () => {
        it('should keep around-the-block stitching narratively aligned (west direct + south fuzzy)', async () => {
            // Arrange:
            //   Start (R) ──north 300k ms──> L_N ──east 300k ms──> L_NE
            //                                ↑                        │
            //                             (south)                  (west)
            //
            // Batch generate from L_NE, travelDurationMs=300k ms, arrivalDirection='east'.
            // Budget = 2 × 300k = 600k ms.
            //
            // Phase 1: 'west' exit exists → reconnect to L_N.
            // Stub directions remaining: ['north', 'south'].
            // Phase 2 candidates from L_NE within 600k ms:
            //   L_N  (1 hop, 300k ms) – already used by Phase 1.
            //   R    (2 hops, 300k+300k = 600k ms) – vector is southwest from L_NE,
            //          so it is narratively aligned with 'south' (not 'north').
            // 'north' → no aligned candidates → 1 new stub.
            //
            // Expected: 1 new location (north), 2 reconnections (west→L_N, south→R).
            const rId = uuidv4()
            const lNorthId = uuidv4()
            const lNEId = uuidv4()

            await locationRepo.upsert({
                id: rId,
                name: 'Start',
                description: 'Starting point',
                terrain: 'open-plain',
                tags: [],
                exits: [],
                version: 1
            })
            await locationRepo.upsert({
                id: lNorthId,
                name: 'North',
                description: 'North location',
                terrain: 'open-plain',
                tags: [],
                exits: [],
                version: 1
            })
            await locationRepo.upsert({
                id: lNEId,
                name: 'NE Clearing',
                description: 'Northeast clearing',
                terrain: 'open-plain',
                tags: [],
                exits: [],
                version: 1
            })

            // Wire exits with explicit 300k ms travel durations
            await locationRepo.ensureExitBidirectional(rId, 'north', lNorthId, { reciprocal: true })
            await locationRepo.setExitTravelDuration(rId, 'north', 300_000)
            await locationRepo.setExitTravelDuration(lNorthId, 'south', 300_000)

            await locationRepo.ensureExitBidirectional(lNorthId, 'east', lNEId, { reciprocal: true })
            await locationRepo.setExitTravelDuration(lNorthId, 'east', 300_000)
            await locationRepo.setExitTravelDuration(lNEId, 'west', 300_000)

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
                    rootLocationId: lNEId,
                    terrain: 'open-plain',
                    arrivalDirection: 'east', // Player arrived at L_NE by traveling east (from L_N)
                    expansionDepth: 1,
                    batchSize: 3, // Wants: north, south, west
                    travelDurationMs: 300_000
                }
            }

            // Act
            const result = await handler.handle(event, mockContext)

            // Assert: handler succeeded
            assert.equal(result.outcome, 'success')

            // 'west' reconnects to L_N (Phase 1 direct).
            // 'south' reconnects to R (Phase 2 – 2 hops × 300k ms = 600k ms = budget limit).
            // 'north' gets a new stub (no narratively aligned candidates remaining).
            const allLocations = await locationRepo.listAll()
            const newCount = allLocations.length - baselineCount
            assert.equal(newCount, 1, 'Should create exactly 1 new stub (north only); south and west reconnected')

            const completedEvent = mockTelemetry.events.find((e) => e.name === 'World.BatchGeneration.Completed')
            assert.ok(completedEvent, 'Should emit Completed telemetry')
            assert.equal(completedEvent.properties.locationsGenerated, 1, 'locationsGenerated should be 1')
            assert.equal(completedEvent.properties.reconnectionsCreated, 2, 'reconnectionsCreated should be 2 (south→R and west→L_N)')

            // Verify narrative-aligned closure: L_NE should now have a south exit pointing to R
            const lNEAfter = await locationRepo.get(lNEId)
            const southExit = lNEAfter?.exits?.find((e) => e.direction === 'south')
            assert.ok(southExit, 'L_NE should have a south exit after Phase 2 narrative-aligned closure')
            assert.equal(southExit.to, rId, 'L_NE south exit should point back to Start (R)')
        })

        it('should stitch two wilderness paths within 300k ms budget deterministically', async () => {
            // Arrange:
            //   L_A ──east──>  HUB ──north──> ROOT (batch root, arrivalDirection='north')
            //   L_B ──west──>  HUB
            //
            // ROOT has south exit to HUB (Phase 1 direct reconnect).
            // HUB has east→L_A and west→L_B each at 300k ms.
            // Both L_A and L_B are 2 hops (600k ms) from ROOT – exactly at budget.
            // Narrative alignment should route east toward L_A and west toward L_B.
            // Expected: 0 new stubs, 3 reconnections.
            const rootId = uuidv4()
            const hubId = uuidv4()
            const idA = uuidv4()
            const idB = uuidv4()

            for (const [id, name] of [
                [rootId, 'Root'],
                [hubId, 'Hub'],
                [idA, 'Branch A'],
                [idB, 'Branch B']
            ]) {
                await locationRepo.upsert({ id, name, description: '', terrain: 'open-plain', tags: [], exits: [], version: 1 })
            }

            // ROOT→south→HUB with 300k ms (Phase 1 direct hit for 'south')
            await locationRepo.ensureExitBidirectional(rootId, 'south', hubId, { reciprocal: true })
            await locationRepo.setExitTravelDuration(rootId, 'south', 300_000)
            await locationRepo.setExitTravelDuration(hubId, 'north', 300_000)

            // HUB→east→L_A and HUB→west→L_B (both 2 hops, 600k ms from ROOT)
            await locationRepo.ensureExitBidirectional(hubId, 'east', idA, { reciprocal: true })
            await locationRepo.setExitTravelDuration(hubId, 'east', 300_000)
            await locationRepo.setExitTravelDuration(idA, 'west', 300_000)

            await locationRepo.ensureExitBidirectional(hubId, 'west', idB, { reciprocal: true })
            await locationRepo.setExitTravelDuration(hubId, 'west', 300_000)
            await locationRepo.setExitTravelDuration(idB, 'east', 300_000)

            const baselineCount = (await locationRepo.listAll()).length // 4

            // open-plain default directions: [north, south, east, west]
            // arrivalDirection='north' filtered → [south, east, west]; batchSize=3
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
                    batchSize: 3,
                    travelDurationMs: 300_000
                }
            }

            // Act
            const result = await handler.handle(event, mockContext)
            assert.equal(result.outcome, 'success')

            // 0 new stubs: south→HUB (Phase 1), east→lex-smallest (Phase 2), west→lex-largest (Phase 2)
            const allLocations = await locationRepo.listAll()
            assert.equal(allLocations.length - baselineCount, 0, 'No new stubs: all 3 directions stitched within 300k ms budget')

            const completedEvent = mockTelemetry.events.find((e) => e.name === 'World.BatchGeneration.Completed')
            assert.ok(completedEvent, 'Should emit Completed telemetry')
            assert.equal(completedEvent.properties.locationsGenerated, 0, 'locationsGenerated should be 0')
            assert.equal(completedEvent.properties.reconnectionsCreated, 3, 'reconnectionsCreated should be 3')

            // Verify direction-aligned assignment for the two equidistant branches
            const rootAfter = await locationRepo.get(rootId)
            const eastExit = rootAfter?.exits?.find((e) => e.direction === 'east')
            const westExit = rootAfter?.exits?.find((e) => e.direction === 'west')
            assert.ok(eastExit, "ROOT should have an 'east' exit")
            assert.ok(westExit, "ROOT should have a 'west' exit")
            assert.equal(eastExit.to, idA, 'east exit should point to east-leaning candidate')
            assert.equal(westExit.to, idB, 'west exit should point to west-leaning candidate')
        })

        it('should not stitch across realmKey boundaries during Phase 2 wilderness reconnection', async () => {
            // Arrange:
            //   ROOT (realm:A) ──south──> BRIDGE (realm:A) ──east──> L_SAME (realm:A)
            //                                                ──west──> L_OTHER (realm:B)
            //
            // Batch generate from ROOT with realmKey='realm:A', travelDurationMs=300k ms.
            // Phase 1: south→BRIDGE (direct).
            // Phase 2 budget=600k ms; candidates filtered to realm:A only.
            //   BRIDGE (realm:A, 1 hop, 300k) – used.
            //   L_SAME (realm:A, 2 hops, 600k) – available → stitched to 'east' stub.
            //   L_OTHER (realm:B, 2 hops, 600k) – excluded by realmKey filter → 'west' gets a new stub.
            // Expected: 1 new stub (west), 2 reconnections (south→BRIDGE Phase 1, east→L_SAME Phase 2).
            const rootId = uuidv4()
            const bridgeId = uuidv4()
            const lSameId = uuidv4()
            const lOtherId = uuidv4()

            await locationRepo.upsert({
                id: rootId,
                name: 'Root',
                description: '',
                terrain: 'open-plain',
                tags: ['realm:A'],
                exits: [],
                version: 1
            })
            await locationRepo.upsert({
                id: bridgeId,
                name: 'Bridge',
                description: '',
                terrain: 'open-plain',
                tags: ['realm:A'],
                exits: [],
                version: 1
            })
            await locationRepo.upsert({
                id: lSameId,
                name: 'Same Realm',
                description: '',
                terrain: 'open-plain',
                tags: ['realm:A'],
                exits: [],
                version: 1
            })
            await locationRepo.upsert({
                id: lOtherId,
                name: 'Other Realm',
                description: '',
                terrain: 'open-plain',
                tags: ['realm:B'],
                exits: [],
                version: 1
            })

            // ROOT→south→BRIDGE (Phase 1 direct)
            await locationRepo.ensureExitBidirectional(rootId, 'south', bridgeId, { reciprocal: true })
            await locationRepo.setExitTravelDuration(rootId, 'south', 300_000)
            await locationRepo.setExitTravelDuration(bridgeId, 'north', 300_000)

            // BRIDGE→east→L_SAME (same realm, 2 hops from ROOT)
            await locationRepo.ensureExitBidirectional(bridgeId, 'east', lSameId, { reciprocal: true })
            await locationRepo.setExitTravelDuration(bridgeId, 'east', 300_000)
            await locationRepo.setExitTravelDuration(lSameId, 'west', 300_000)

            // BRIDGE→west→L_OTHER (different realm, 2 hops from ROOT)
            await locationRepo.ensureExitBidirectional(bridgeId, 'west', lOtherId, { reciprocal: true })
            await locationRepo.setExitTravelDuration(bridgeId, 'west', 300_000)
            await locationRepo.setExitTravelDuration(lOtherId, 'east', 300_000)

            const baselineCount = (await locationRepo.listAll()).length // 4

            // open-plain: [north, south, east, west]; filter arrivalDirection='north' → [south, east, west]
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
                    batchSize: 3,
                    travelDurationMs: 300_000,
                    realmKey: 'realm:A' // Only stitch within realm:A
                }
            }

            // Act
            const result = await handler.handle(event, mockContext)
            assert.equal(result.outcome, 'success')

            // 1 new stub (west – L_OTHER excluded by realm filter)
            const allLocations = await locationRepo.listAll()
            assert.equal(
                allLocations.length - baselineCount,
                1,
                'Should create exactly 1 new stub (west); L_OTHER excluded by realmKey filter'
            )

            const completedEvent = mockTelemetry.events.find((e) => e.name === 'World.BatchGeneration.Completed')
            assert.ok(completedEvent, 'Should emit Completed telemetry')
            assert.equal(completedEvent.properties.locationsGenerated, 1, 'locationsGenerated should be 1 (west stub)')
            assert.equal(
                completedEvent.properties.reconnectionsCreated,
                2,
                'reconnectionsCreated should be 2 (south→BRIDGE Phase 1, east→L_SAME Phase 2)'
            )

            // Verify east exit points to L_SAME (same realm), NOT L_OTHER (different realm)
            const rootAfter = await locationRepo.get(rootId)
            const eastExit = rootAfter?.exits?.find((e) => e.direction === 'east')
            assert.ok(eastExit, "ROOT should have an 'east' exit via Phase 2 stitching")
            assert.equal(eastExit.to, lSameId, 'east exit should stitch to L_SAME (same realm), not L_OTHER')
            assert.notEqual(eastExit.to, lOtherId, 'east exit must NOT stitch across realm boundary to L_OTHER')
        })

        it('should be idempotent: rerunning batch generate on a fully-expanded root creates no duplicates', async () => {
            // Arrange: Pre-wire a root location with fully-created bidirectional exits to 3 neighbors
            // (simulating the state after a prior batch-generate + exit-create cycle has completed).
            // A second batch generate must reconnect all 3 directions via Phase 1 and create 0 new stubs.
            const rootId = uuidv4()
            const lNorthId = uuidv4()
            const lEastId = uuidv4()
            const lWestId = uuidv4()

            for (const [id, name] of [
                [rootId, 'Expanded Root'],
                [lNorthId, 'North Stub'],
                [lEastId, 'East Stub'],
                [lWestId, 'West Stub']
            ]) {
                await locationRepo.upsert({ id, name, description: '', terrain: 'open-plain', tags: [], exits: [], version: 1 })
            }

            // Wire bidirectional exits with explicit 300k ms (mirrors what ExitCreateHandler would produce)
            await locationRepo.ensureExitBidirectional(rootId, 'north', lNorthId, { reciprocal: true })
            await locationRepo.setExitTravelDuration(rootId, 'north', 300_000)
            await locationRepo.setExitTravelDuration(lNorthId, 'south', 300_000)

            await locationRepo.ensureExitBidirectional(rootId, 'east', lEastId, { reciprocal: true })
            await locationRepo.setExitTravelDuration(rootId, 'east', 300_000)
            await locationRepo.setExitTravelDuration(lEastId, 'west', 300_000)

            await locationRepo.ensureExitBidirectional(rootId, 'west', lWestId, { reciprocal: true })
            await locationRepo.setExitTravelDuration(rootId, 'west', 300_000)
            await locationRepo.setExitTravelDuration(lWestId, 'east', 300_000)

            const baselineCount = (await locationRepo.listAll()).length // 4

            // Run batch generate – all 3 directions already have exits → Phase 1 reconnects all.
            const makeEvent = (): WorldEventEnvelope => ({
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
                    arrivalDirection: 'south', // south is filtered; N/E/W are checked
                    expansionDepth: 1,
                    batchSize: 3,
                    travelDurationMs: 300_000
                }
            })

            // First rerun
            const firstResult = await handler.handle(makeEvent(), mockContext)
            assert.equal(firstResult.outcome, 'success')

            const afterFirst = await locationRepo.listAll()
            assert.equal(afterFirst.length - baselineCount, 0, 'First rerun: no new locations (all exits found by Phase 1)')

            const firstCompleted = mockTelemetry.events.find((e) => e.name === 'World.BatchGeneration.Completed')
            assert.ok(firstCompleted, 'Should emit Completed telemetry')
            assert.equal(firstCompleted.properties.locationsGenerated, 0, 'First rerun: locationsGenerated must be 0')
            assert.equal(firstCompleted.properties.reconnectionsCreated, 3, 'First rerun: all 3 directions reconnect via Phase 1')

            mockTelemetry.clear()

            // Second rerun – must produce identical results
            const secondResult = await handler.handle(makeEvent(), mockContext)
            assert.equal(secondResult.outcome, 'success')

            const afterSecond = await locationRepo.listAll()
            assert.equal(afterSecond.length, afterFirst.length, 'Second rerun: location count unchanged (idempotent)')

            const secondCompleted = mockTelemetry.events.find((e) => e.name === 'World.BatchGeneration.Completed')
            assert.ok(secondCompleted, 'Should emit Completed telemetry on second rerun')
            assert.equal(secondCompleted.properties.locationsGenerated, 0, 'Second rerun: locationsGenerated must be 0')
            assert.equal(secondCompleted.properties.reconnectionsCreated, 3, 'Second rerun: reconnectionsCreated must be 3 (no duplicates)')

            // Verify no duplicate exits were introduced on root
            const rootAfter = await locationRepo.get(rootId)
            const northExits = rootAfter?.exits?.filter((e) => e.direction === 'north') ?? []
            const eastExits = rootAfter?.exits?.filter((e) => e.direction === 'east') ?? []
            const westExits = rootAfter?.exits?.filter((e) => e.direction === 'west') ?? []
            assert.equal(northExits.length, 1, 'Root must have exactly 1 north exit (no duplicates)')
            assert.equal(eastExits.length, 1, 'Root must have exactly 1 east exit (no duplicates)')
            assert.equal(westExits.length, 1, 'Root must have exactly 1 west exit (no duplicates)')
        })
    })
})
