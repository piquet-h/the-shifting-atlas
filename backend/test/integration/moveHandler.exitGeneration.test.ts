/**
 * Integration tests for Exit Generation Hint Integration (Issue #597)
 *
 * Tests cover:
 * - Returns { status: 'generate', canonical, generationHint } when canonical dir has no EXIT
 * - Emits Navigation.Exit.GenerationRequested with hashed identifiers and debounceHit flag
 * - No event when EXIT exists (normal movement)
 * - Debounce effectiveness (identical requests within window)
 * - Interior locations (those with an 'out' exit) must NOT emit hints for 'in' direction
 */
import type { HttpRequest, InvocationContext } from '@azure/functions'
import { resetExitGenerationHintStore, STARTER_LOCATION_ID } from '@piquet-h/shared'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { TOKENS } from '../../src/di/tokens.js'
import { MoveHandler } from '../../src/handlers/moveCore.js'
import { InMemoryExitGenerationHintPublisher } from '../../src/queues/exitGenerationHintPublisher.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import type { MockTelemetryClient } from '../helpers/MockTelemetryClient.js'
import { makeMoveRequest } from '../helpers/testUtils.js'

describe('Exit Generation Hint Integration', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
        // Reset global hint store for test isolation
        resetExitGenerationHintStore()
    })

    afterEach(async () => {
        await fixture.teardown()
        resetExitGenerationHintStore()
    })

    /** Helper to create a mock InvocationContext with container */
    async function createMockContext(fixture: IntegrationTestFixture): Promise<InvocationContext> {
        const container = await fixture.getContainer()
        return {
            invocationId: 'test-invocation',
            functionName: 'test-function',
            extraInputs: new Map([['container', container]]),
            log: () => {},
            error: () => {},
            warn: () => {},
            info: () => {},
            debug: () => {},
            trace: () => {}
        } as unknown as InvocationContext
    }

    test('returns generate status when canonical direction has no EXIT', async () => {
        const ctx = await createMockContext(fixture)
        // STARTER_LOCATION_ID (Mosswell River Jetty) has many exits (north, south, east, west, etc.)
        // but does not have 'in' exit; request 'in' which doesn't exist
        const req = makeMoveRequest({ dir: 'in' }) as HttpRequest

        const container = await fixture.getContainer()
        const handler = container.get(MoveHandler)
        await handler.handle(req, ctx)
        const res = await handler.performMove(req)

        assert.equal(res.success, false)
        assert.equal(res.error?.type, 'generate')
        assert.equal(res.error?.statusCode, 400)
        assert.ok(res.error?.clarification)
        assert.ok(res.error?.generationHint)
        assert.equal(res.error?.generationHint?.direction, 'in')
    })

    test('emits Navigation.Exit.GenerationRequested with hashed IDs on first request', async () => {
        const ctx = await createMockContext(fixture)
        const req = makeMoveRequest({ dir: 'in' }) as HttpRequest

        const container = await fixture.getContainer()
        const handler = container.get(MoveHandler)
        const telemetry = container.get<MockTelemetryClient>('ITelemetryClient')
        telemetry.clear()

        await handler.handle(req, ctx)
        await handler.performMove(req)

        const events = telemetry.events
        const generationEvent = events.find((e) => e.name === 'Navigation.Exit.GenerationRequested')
        assert.ok(generationEvent, 'Should emit Navigation.Exit.GenerationRequested event')
        assert.equal(generationEvent.properties.dir, 'in')
        assert.ok(generationEvent.properties.originHashed, 'Should include hashed origin location')
        assert.ok(generationEvent.properties.playerHashed, 'Should include hashed player ID')
        assert.equal(generationEvent.properties.debounceHit, false)
        assert.ok(generationEvent.properties.timestamp)
    })

    test('no event emitted when EXIT exists (normal movement)', async () => {
        const ctx = await createMockContext(fixture)
        // Request 'north' which exists in STARTER_LOCATION_ID
        const req = makeMoveRequest({ dir: 'north' }) as HttpRequest

        const container = await fixture.getContainer()
        const handler = container.get(MoveHandler)
        const telemetry = container.get<MockTelemetryClient>('ITelemetryClient')
        telemetry.clear()

        await handler.handle(req, ctx)
        const res = await handler.performMove(req)

        // Should succeed
        assert.equal(res.success, true)

        // Should not emit generation requested event
        const events = telemetry.events
        const generationEvent = events.find((e) => e.name === 'Navigation.Exit.GenerationRequested')
        assert.equal(generationEvent, undefined, 'Should not emit generation event for existing exit')
    })

    test('debounce effectiveness - identical requests within window', async () => {
        const ctx = await createMockContext(fixture)
        const req1 = makeMoveRequest({ dir: 'in' }) as HttpRequest
        const req2 = makeMoveRequest({ dir: 'in' }) as HttpRequest

        const container = await fixture.getContainer()
        // Use separate handler instances to simulate multiple concurrent requests
        // The debounce store is global, so this properly tests cross-handler debouncing
        const handler1 = container.get(MoveHandler)
        const handler2 = container.get(MoveHandler)
        const telemetry = container.get<MockTelemetryClient>('ITelemetryClient')
        telemetry.clear()

        // First request
        await handler1.handle(req1, ctx)
        await handler1.performMove(req1)

        // Second identical request (should be debounced)
        await handler2.handle(req2, ctx)
        await handler2.performMove(req2)

        const events = telemetry.events
        const generationEvents = events.filter((e) => e.name === 'Navigation.Exit.GenerationRequested')

        // Should only emit one event (first request), second should be debounced
        assert.equal(generationEvents.length, 1, 'Should only emit one event due to debounce')
        assert.equal(generationEvents[0].properties.debounceHit, false, 'First event should not be debounced')
    })

    test('interior location: move in suppresses hint emission and does not enqueue message', async () => {
        // Arrange: materialize an interior room by seeding a location with an 'out' exit
        // (the Common Room bug: interior had an 'out' exit back to the street but also
        // accidentally gained an 'in' exit via hint processing).
        const ctx = await createMockContext(fixture)
        const locationRepo = await fixture.getLocationRepository()
        const interiorId = 'aaaaaaaa-0000-4000-8000-000000000001'
        const exteriorId = 'aaaaaaaa-0000-4000-8000-000000000002'
        await locationRepo.upsert({
            id: exteriorId,
            name: 'Lantern and Ladle',
            description: 'A tavern exterior.',
            exits: [{ direction: 'in', to: interiorId }],
            version: 1
        })
        await locationRepo.upsert({
            id: interiorId,
            name: 'Lantern and Ladle — Common Room',
            description: 'Stew steam and low songs.',
            exits: [{ direction: 'out', to: exteriorId }],
            version: 1
        })

        const container = await fixture.getContainer()
        const handler = container.get(MoveHandler)
        const telemetry = container.get<MockTelemetryClient>('ITelemetryClient')
        const publisher = container.get<InMemoryExitGenerationHintPublisher>(
            TOKENS.ExitGenerationHintPublisher
        ) as InMemoryExitGenerationHintPublisher
        telemetry.clear()

        // Player is inside the Common Room and tries 'move in'
        const playerId = '00000000-0000-4000-8000-000000000042'
        const req = makeMoveRequest({ dir: 'in', from: interiorId }, { 'x-player-guid': playerId }, { playerId }) as HttpRequest
        await handler.handle(req, ctx)
        const res = await handler.performMove(req)

        // Should fail with no-exit (not a crash)
        assert.equal(res.success, false)
        assert.equal(res.error?.statusCode, 400)

        // Must NOT emit a generation-requested telemetry event for the 'in' direction
        const genEvent = telemetry.events.find((e) => e.name === 'Navigation.Exit.GenerationRequested')
        assert.equal(genEvent, undefined, 'Interior location must not emit generation hint for in direction')

        // Must NOT enqueue any hint message
        const enqueued = publisher.enqueuedMessages.filter((m) => m.payload?.dir === 'in')
        assert.equal(enqueued.length, 0, 'Interior location must not enqueue in-direction hint')
    })

    test('interior location: move in response has no generationHint payload', async () => {
        // Regression: generationHint must be absent so the frontend cannot trigger
        // world expansion from inside a structure.
        const ctx = await createMockContext(fixture)
        const locationRepo = await fixture.getLocationRepository()
        const interiorId = 'bbbbbbbb-0000-4000-8000-000000000001'
        const exteriorId = 'bbbbbbbb-0000-4000-8000-000000000002'
        await locationRepo.upsert({
            id: exteriorId,
            name: 'Exterior',
            description: 'Outside.',
            exits: [{ direction: 'in', to: interiorId }],
            version: 1
        })
        await locationRepo.upsert({
            id: interiorId,
            name: 'Interior',
            description: 'Inside.',
            exits: [{ direction: 'out', to: exteriorId }],
            version: 1
        })

        const container = await fixture.getContainer()
        const handler = container.get(MoveHandler)
        const req = makeMoveRequest({ dir: 'in', from: interiorId }) as HttpRequest
        await handler.handle(req, ctx)
        const res = await handler.performMove(req)

        assert.equal(res.success, false)
        assert.equal(res.error?.generationHint, undefined, 'generationHint must not be present for interior in-exit attempt')
    })

    test('different directions at same location are not debounced', async () => {
        const ctx = await createMockContext(fixture)
        const req1 = makeMoveRequest({ dir: 'in' }) as HttpRequest
        const req2 = makeMoveRequest({ dir: 'out' }) as HttpRequest

        const container = await fixture.getContainer()
        const handler1 = container.get(MoveHandler)
        const handler2 = container.get(MoveHandler)
        const telemetry = container.get<MockTelemetryClient>('ITelemetryClient')
        telemetry.clear()

        await handler1.handle(req1, ctx)
        await handler1.performMove(req1)

        await handler2.handle(req2, ctx)
        await handler2.performMove(req2)

        const events = telemetry.events
        const generationEvents = events.filter((e) => e.name === 'Navigation.Exit.GenerationRequested')

        // Should emit two events (different directions)
        assert.equal(generationEvents.length, 2, 'Should emit two events for different directions')
    })

    test('non-canonical direction returns standard no-exit error', async () => {
        const ctx = await createMockContext(fixture)
        // Request invalid direction that's not canonical
        const req = makeMoveRequest({ dir: 'invalid-dir' }) as HttpRequest

        const container = await fixture.getContainer()
        const handler = container.get(MoveHandler)
        await handler.handle(req, ctx)
        const res = await handler.performMove(req)

        assert.equal(res.success, false)
        // Should return invalid-direction, not generate
        assert.equal(res.error?.type, 'invalid-direction')
        assert.equal(res.error?.statusCode, 400)
    })

    test('generate response includes generationHint payload', async () => {
        const ctx = await createMockContext(fixture)
        const req = makeMoveRequest({ dir: 'out' }) as HttpRequest

        const container = await fixture.getContainer()
        const handler = container.get(MoveHandler)
        await handler.handle(req, ctx)
        const res = await handler.performMove(req)

        assert.equal(res.success, false)
        assert.equal(res.error?.type, 'generate')
        assert.ok(res.error?.generationHint)
        assert.ok(res.error?.generationHint?.originLocationId)
        assert.equal(res.error?.generationHint?.direction, 'out')
    })

    test('enqueues exit-generation-hint message for authenticated player in memory mode', async () => {
        const ctx = await createMockContext(fixture)
        const playerId = '00000000-0000-4000-8000-000000000777'
        const req = makeMoveRequest(
            { dir: 'out' },
            { 'x-player-guid': playerId },
            {
                playerId
            }
        ) as HttpRequest

        const container = await fixture.getContainer()
        const handler = container.get(MoveHandler)

        const publisher = container.get<InMemoryExitGenerationHintPublisher>(
            TOKENS.ExitGenerationHintPublisher
        ) as InMemoryExitGenerationHintPublisher

        await handler.handle(req, ctx)
        const res = await handler.performMove(req)

        assert.equal(res.success, false)
        assert.equal(res.error?.type, 'generate')
        assert.ok(publisher.enqueuedMessages.length > 0, 'Should enqueue hint message for authenticated player')
        assert.equal(publisher.enqueuedMessages[0].type, 'Navigation.Exit.GenerationHint')
        assert.equal(publisher.enqueuedMessages[0].actor.id, playerId)
    })

    test('memory autodrain materializes exit hint and preserves correlationId through handler telemetry', async () => {
        const previousAutoDrain = process.env.MEMORY_QUEUE_AUTODRAIN
        process.env.MEMORY_QUEUE_AUTODRAIN = 'true'

        const localFixture = new IntegrationTestFixture('memory')

        try {
            await localFixture.setup()
            resetExitGenerationHintStore()

            const ctx = await createMockContext(localFixture)
            const playerId = '00000000-0000-4000-8000-000000000778'
            const req = makeMoveRequest(
                { dir: 'out' },
                { 'x-player-guid': playerId },
                {
                    playerId
                }
            ) as HttpRequest

            const container = await localFixture.getContainer()
            const handler = container.get(MoveHandler)
            const telemetry = container.get<MockTelemetryClient>('ITelemetryClient')
            const locationRepo = await localFixture.getLocationRepository()
            telemetry.clear()

            await handler.handle(req, ctx)

            const requestEvent = telemetry.events.find(
                (e) => e.name === 'Navigation.Exit.GenerationRequested' && e.properties?.outcome === undefined
            )
            const materializedEvent = telemetry.events.find(
                (e) => e.name === 'Navigation.Exit.GenerationRequested' && e.properties?.outcome === 'materialized'
            )

            assert.ok(requestEvent, 'Move request should emit generation-requested telemetry')
            assert.ok(materializedEvent, 'Autodrain handler should emit materialized telemetry')
            assert.strictEqual(materializedEvent.properties?.correlationId, requestEvent.properties?.correlationId)

            const updatedOrigin = await locationRepo.get(STARTER_LOCATION_ID)
            const outExit = updatedOrigin?.exits?.find((e) => e.direction === 'out')
            assert.ok(outExit, 'Autodrain should materialize the requested out exit immediately in memory mode')
        } finally {
            await localFixture.teardown()
            resetExitGenerationHintStore()
            if (previousAutoDrain === undefined) {
                delete process.env.MEMORY_QUEUE_AUTODRAIN
            } else {
                process.env.MEMORY_QUEUE_AUTODRAIN = previousAutoDrain
            }
        }
    })
})
