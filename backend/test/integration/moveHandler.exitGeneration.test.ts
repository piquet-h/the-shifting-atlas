/**
 * Integration tests for Exit Generation Hint Integration (Issue #597)
 *
 * Tests cover:
 * - Returns { status: 'generate', canonical, generationHint } when canonical dir has no EXIT
 * - Emits Navigation.Exit.GenerationRequested with hashed identifiers and debounceHit flag
 * - No event when EXIT exists (normal movement)
 * - Debounce effectiveness (identical requests within window)
 */
import type { HttpRequest, InvocationContext } from '@azure/functions'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { resetExitGenerationHintStore } from '@piquet-h/shared'
import { MoveHandler } from '../../src/handlers/moveCore.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import { makeMoveRequest } from '../helpers/testUtils.js'
import type { MockTelemetryClient } from '../helpers/MockTelemetryClient.js'

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
})
