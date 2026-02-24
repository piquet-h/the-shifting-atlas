/**
 * Integration tests for AreaGenerationOrchestrator
 *
 * Tests cover (memory mode):
 * - Respects budget bounds (clamped to MAX_BUDGET_LOCATIONS)
 * - Emits expected World.Location.BatchGenerate enqueue calls
 * - Idempotency: same idempotencyKey yields stable event key
 * - auto mode: terrain resolved from anchor location
 * - auto mode: falls back to open-plain when anchor has no terrain
 * - urban / wilderness mode: uses mode-specific terrain fallback
 * - Throws when anchor location not found
 * - Emits lifecycle telemetry (Started, Completed, Failed)
 */

import type { Location } from '@piquet-h/shared'
import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { v4 as uuidv4 } from 'uuid'
import { TOKENS } from '../../src/di/tokens.js'
import { AreaGenerationOrchestrator, LocationNotFoundError, MAX_BUDGET_LOCATIONS } from '../../src/services/AreaGenerationOrchestrator.js'
import type { ILocationRepository } from '../../src/repos/locationRepository.js'
import type { IRealmRepository } from '../../src/repos/realmRepository.js'
import { InMemoryWorldEventPublisher } from '../../src/worldEvents/worldEventPublisher.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import { MockTelemetryClient } from '../mocks/MockTelemetryClient.js'

describe('AreaGenerationOrchestrator (Integration - memory mode)', () => {
    let fixture: IntegrationTestFixture
    let orchestrator: AreaGenerationOrchestrator
    let locationRepo: ILocationRepository
    let realmRepo: IRealmRepository
    let eventPublisher: InMemoryWorldEventPublisher
    let mockTelemetry: MockTelemetryClient

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
        const container = await fixture.getContainer()

        orchestrator = container.get(AreaGenerationOrchestrator)
        locationRepo = container.get<ILocationRepository>(TOKENS.LocationRepository)
        realmRepo = await fixture.getRealmRepository()
        eventPublisher = container.get<InMemoryWorldEventPublisher>(TOKENS.WorldEventPublisher)
        mockTelemetry = container.get<MockTelemetryClient>(TOKENS.TelemetryClient) as MockTelemetryClient

        mockTelemetry.clear()
        eventPublisher.clear()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('Budget bounds', () => {
        test('enqueues one batch event with batchSize equal to budget when under max', async () => {
            // The starter location is seeded; use it as anchor
            const result = await orchestrator.orchestrate(
                {
                    anchorLocationId: STARTER_LOCATION_ID,
                    mode: 'auto',
                    budgetLocations: 5
                },
                uuidv4()
            )

            assert.strictEqual(result.enqueuedCount, 1, 'Should enqueue exactly one event')
            assert.strictEqual(result.clamped, false, 'Budget 5 should not be clamped')

            const events = eventPublisher.enqueuedEvents.filter((e) => e.type === 'World.Location.BatchGenerate')
            assert.strictEqual(events.length, 1, 'Exactly one World.Location.BatchGenerate event expected')
            assert.strictEqual(events[0].payload.batchSize, 5, 'batchSize should match budget')
            assert.strictEqual(events[0].payload.rootLocationId, STARTER_LOCATION_ID)
        })

        test('clamps budget exceeding MAX_BUDGET_LOCATIONS', async () => {
            const oversizedBudget = MAX_BUDGET_LOCATIONS + 10

            const result = await orchestrator.orchestrate(
                {
                    anchorLocationId: STARTER_LOCATION_ID,
                    mode: 'auto',
                    budgetLocations: oversizedBudget
                },
                uuidv4()
            )

            assert.strictEqual(result.clamped, true, 'Should report clamped=true')
            const events = eventPublisher.enqueuedEvents.filter((e) => e.type === 'World.Location.BatchGenerate')
            assert.ok(events.length > 0, 'Should have enqueued events')
            assert.ok(
                (events[0].payload.batchSize as number) <= MAX_BUDGET_LOCATIONS,
                `batchSize must not exceed MAX_BUDGET_LOCATIONS (${MAX_BUDGET_LOCATIONS})`
            )
        })

        test('budget equal to max is not clamped', async () => {
            const result = await orchestrator.orchestrate(
                {
                    anchorLocationId: STARTER_LOCATION_ID,
                    mode: 'auto',
                    budgetLocations: MAX_BUDGET_LOCATIONS
                },
                uuidv4()
            )

            assert.strictEqual(result.clamped, false)
            const events = eventPublisher.enqueuedEvents.filter((e) => e.type === 'World.Location.BatchGenerate')
            assert.strictEqual(events[0].payload.batchSize as number, MAX_BUDGET_LOCATIONS)
        })
    })

    describe('Idempotency', () => {
        test('repeated calls with same idempotencyKey produce events with same stable key', async () => {
            const idempotencyKey = `test-idem-${uuidv4()}`
            const correlationId = uuidv4()

            // First call
            eventPublisher.clear()
            await orchestrator.orchestrate(
                { anchorLocationId: STARTER_LOCATION_ID, mode: 'auto', budgetLocations: 3, idempotencyKey },
                correlationId
            )
            const firstEvents = [...eventPublisher.enqueuedEvents]

            // Second call with same key
            eventPublisher.clear()
            await orchestrator.orchestrate(
                { anchorLocationId: STARTER_LOCATION_ID, mode: 'auto', budgetLocations: 3, idempotencyKey },
                correlationId
            )
            const secondEvents = [...eventPublisher.enqueuedEvents]

            assert.strictEqual(firstEvents.length, 1)
            assert.strictEqual(secondEvents.length, 1)

            // Both calls produce the same idempotencyKey on the event envelope
            assert.strictEqual(
                firstEvents[0].idempotencyKey,
                secondEvents[0].idempotencyKey,
                'Idempotency key on envelope must be stable across repeated calls with the same caller key'
            )
        })

        test('calls without idempotencyKey produce unique event keys each time', async () => {
            const result1 = await orchestrator.orchestrate(
                { anchorLocationId: STARTER_LOCATION_ID, mode: 'auto', budgetLocations: 2 },
                uuidv4()
            )
            eventPublisher.clear()
            const result2 = await orchestrator.orchestrate(
                { anchorLocationId: STARTER_LOCATION_ID, mode: 'auto', budgetLocations: 2 },
                uuidv4()
            )

            assert.notStrictEqual(result1.idempotencyKey, result2.idempotencyKey, 'Auto-generated keys must differ between calls')
        })
    })

    describe('Terrain resolution', () => {
        test('auto mode: uses terrain from anchor location when set', async () => {
            const anchorId = uuidv4()
            const anchor: Location = {
                id: anchorId,
                name: 'Dense Forest Test',
                description: 'A test location in a dense forest',
                terrain: 'dense-forest',
                tags: [],
                version: 1
            }
            await locationRepo.upsert(anchor)

            const result = await orchestrator.orchestrate({ anchorLocationId: anchorId, mode: 'auto', budgetLocations: 3 }, uuidv4())

            assert.strictEqual(result.terrain, 'dense-forest', 'Should use location terrain in auto mode')
            const events = eventPublisher.enqueuedEvents.filter((e) => e.type === 'World.Location.BatchGenerate')
            assert.strictEqual(events[0].payload.terrain, 'dense-forest')
        })

        test('auto mode: falls back to open-plain when anchor has no terrain', async () => {
            const anchorId = uuidv4()
            const anchor: Location = {
                id: anchorId,
                name: 'No Terrain Location',
                description: 'A test location without terrain metadata',
                tags: [],
                version: 1
            }
            await locationRepo.upsert(anchor)

            const result = await orchestrator.orchestrate({ anchorLocationId: anchorId, mode: 'auto', budgetLocations: 2 }, uuidv4())

            assert.strictEqual(result.terrain, 'open-plain', 'Should fall back to open-plain when no terrain on anchor')
        })

        test('urban mode: falls back to narrow-corridor when anchor has no terrain', async () => {
            const anchorId = uuidv4()
            await locationRepo.upsert({
                id: anchorId,
                name: 'Urban No Terrain',
                description: 'Urban anchor without terrain',
                version: 1
            })

            const result = await orchestrator.orchestrate({ anchorLocationId: anchorId, mode: 'urban', budgetLocations: 2 }, uuidv4())

            assert.strictEqual(result.terrain, 'narrow-corridor', 'Urban mode should use narrow-corridor as fallback')
        })

        test('auto mode: infers forest terrain from geographic realm name when anchor has no terrain', async () => {
            const anchorId = uuidv4()
            await locationRepo.upsert({
                id: anchorId,
                name: 'Clearing in the Darkwood Forest',
                description: 'A forest clearing with no terrain set',
                version: 1
            })

            // Add a geographic realm with 'forest' in the name and link the location to it
            const forestRealm = {
                id: uuidv4(),
                name: 'Darkwood Forest',
                realmType: 'FOREST' as const,
                scope: 'REGIONAL' as const,
                narrativeTags: ['ancient', 'dark']
            }
            await realmRepo.upsert(forestRealm)
            await realmRepo.addWithinEdge(anchorId, forestRealm.id)

            const result = await orchestrator.orchestrate({ anchorLocationId: anchorId, mode: 'auto', budgetLocations: 2 }, uuidv4())

            assert.strictEqual(result.terrain, 'dense-forest', 'Should infer dense-forest from geographic realm name containing "forest"')
        })

        test('auto mode: infers hilltop terrain from geographic realm name containing "hill"', async () => {
            const anchorId = uuidv4()
            await locationRepo.upsert({
                id: anchorId,
                name: 'Rocky Outcrop',
                description: 'A rocky outcrop with no terrain set',
                version: 1
            })

            const hillRealm = {
                id: uuidv4(),
                name: 'Ironhill Range',
                realmType: 'MOUNTAIN_RANGE' as const,
                scope: 'MACRO' as const,
                narrativeTags: ['rugged']
            }
            await realmRepo.upsert(hillRealm)
            await realmRepo.addWithinEdge(anchorId, hillRealm.id)

            const result = await orchestrator.orchestrate({ anchorLocationId: anchorId, mode: 'auto', budgetLocations: 2 }, uuidv4())

            assert.strictEqual(result.terrain, 'hilltop', 'Should infer hilltop from geographic realm name containing "hill"')
        })

        test('wilderness mode: falls back to open-plain when anchor has no terrain', async () => {
            const anchorId = uuidv4()
            await locationRepo.upsert({
                id: anchorId,
                name: 'Wilderness No Terrain',
                description: 'Wilderness anchor without terrain',
                version: 1
            })

            const result = await orchestrator.orchestrate({ anchorLocationId: anchorId, mode: 'wilderness', budgetLocations: 2 }, uuidv4())

            assert.strictEqual(result.terrain, 'open-plain', 'Wilderness mode should use open-plain as fallback')
        })
    })

    describe('Anchor selection', () => {
        test('falls back to STARTER_LOCATION_ID when no anchorLocationId provided', async () => {
            const result = await orchestrator.orchestrate({ mode: 'auto', budgetLocations: 1 }, uuidv4())

            assert.strictEqual(result.anchorLocationId, STARTER_LOCATION_ID)
        })

        test('throws LocationNotFoundError when explicit anchorLocationId is not found', async () => {
            const nonExistentId = uuidv4()

            await assert.rejects(
                () => orchestrator.orchestrate({ anchorLocationId: nonExistentId, mode: 'auto', budgetLocations: 2 }, uuidv4()),
                (err: unknown) => {
                    assert.ok(err instanceof LocationNotFoundError, 'Should throw LocationNotFoundError')
                    assert.ok(err.message.includes(nonExistentId), 'Error should mention the missing location ID')
                    return true
                }
            )
        })
    })

    describe('Realm hints', () => {
        test('realm hints are forwarded to the batch generation event payload', async () => {
            const hints = ['mythic', 'coastal']

            await orchestrator.orchestrate(
                {
                    anchorLocationId: STARTER_LOCATION_ID,
                    mode: 'auto',
                    budgetLocations: 2,
                    realmHints: hints
                },
                uuidv4()
            )

            const events = eventPublisher.enqueuedEvents.filter((e) => e.type === 'World.Location.BatchGenerate')
            assert.ok(events.length > 0)
            assert.deepStrictEqual(events[0].payload.realmHints, hints)
        })
    })

    describe('Telemetry', () => {
        test('emits World.AreaGeneration.Started and World.AreaGeneration.Completed on success', async () => {
            await orchestrator.orchestrate({ anchorLocationId: STARTER_LOCATION_ID, mode: 'auto', budgetLocations: 3 }, uuidv4())

            const started = mockTelemetry.events.filter((e) => e.name === 'World.AreaGeneration.Started')
            const completed = mockTelemetry.events.filter((e) => e.name === 'World.AreaGeneration.Completed')

            assert.strictEqual(started.length, 1, 'Should emit World.AreaGeneration.Started')
            assert.strictEqual(completed.length, 1, 'Should emit World.AreaGeneration.Completed')
            assert.strictEqual(started[0].properties.anchorLocationId, STARTER_LOCATION_ID)
            assert.strictEqual(completed[0].properties.anchorLocationId, STARTER_LOCATION_ID)
        })

        test('emits World.AreaGeneration.Failed on error', async () => {
            const missingId = uuidv4()

            await assert.rejects(() =>
                orchestrator.orchestrate({ anchorLocationId: missingId, mode: 'auto', budgetLocations: 1 }, uuidv4())
            )

            const failed = mockTelemetry.events.filter((e) => e.name === 'World.AreaGeneration.Failed')
            assert.strictEqual(failed.length, 1, 'Should emit World.AreaGeneration.Failed')
            assert.ok(typeof failed[0].properties.reason === 'string', 'Failed event should include reason')
        })
    })

    describe('Event envelope shape', () => {
        test('enqueued event has all required BatchGenerate payload fields', async () => {
            await orchestrator.orchestrate({ anchorLocationId: STARTER_LOCATION_ID, mode: 'wilderness', budgetLocations: 4 }, uuidv4())

            const events = eventPublisher.enqueuedEvents.filter((e) => e.type === 'World.Location.BatchGenerate')
            assert.strictEqual(events.length, 1)

            const event = events[0]
            assert.strictEqual(event.type, 'World.Location.BatchGenerate')
            assert.ok(event.eventId, 'eventId required')
            assert.ok(event.occurredUtc, 'occurredUtc required')
            assert.ok(event.correlationId, 'correlationId required')
            assert.ok(event.idempotencyKey, 'idempotencyKey required')
            assert.strictEqual(event.actor.kind, 'system')
            assert.strictEqual(event.payload.rootLocationId, STARTER_LOCATION_ID)
            assert.ok(event.payload.terrain, 'terrain required in payload')
            assert.ok(event.payload.arrivalDirection, 'arrivalDirection required in payload')
            assert.ok(typeof event.payload.expansionDepth === 'number', 'expansionDepth required')
            assert.ok(typeof event.payload.batchSize === 'number', 'batchSize required')
        })
    })
})
