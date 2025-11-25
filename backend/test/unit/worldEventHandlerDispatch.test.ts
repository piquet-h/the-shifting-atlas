/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for type-specific world event handler dispatch (Issue #258)
 */
import type { Container } from 'inversify'
import assert from 'node:assert'
import { beforeEach, describe, test } from 'node:test'
import { queueProcessWorldEvent } from '../../src/handlers/queueProcessWorldEvent.js'
import type { ILocationRepository } from '../../src/repos/locationRepository.js'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'
import type { MockTelemetryClient } from '../mocks/MockTelemetryClient.js'

describe('World Event Handler Dispatch', () => {
    let fixture: UnitTestFixture
    let container: Container
    let telemetry: MockTelemetryClient
    let locationRepo: ILocationRepository

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
        container = await fixture.getContainer()
        telemetry = await fixture.getTelemetryClient()
        locationRepo = container.get<ILocationRepository>('ILocationRepository')
        // Seed locations for ExitCreateHandler success path
        // @ts-expect-error - mock repo has setLocation helper in tests only
        if ('setLocation' in locationRepo) {
            ;(locationRepo as any).setLocation('loc-a', { id: 'loc-a', name: 'A', description: 'A', exits: [] })
            ;(locationRepo as any).setLocation('loc-b', { id: 'loc-b', name: 'B', description: 'B', exits: [] })
        }
    })

    function createExitCreateEvent(overrides?: Record<string, unknown>): Record<string, unknown> {
        return {
            eventId: '10000000-0000-4000-8000-000000000001',
            type: 'World.Exit.Create',
            occurredUtc: '2025-11-25T12:00:00.000Z',
            actor: { kind: 'system' },
            correlationId: '20000000-0000-4000-8000-000000000001',
            idempotencyKey: 'exit:loc-a:north',
            version: 1,
            payload: {
                fromLocationId: 'loc-a',
                toLocationId: 'loc-b',
                direction: 'north'
            },
            ...overrides
        }
    }

    function createNpcTickEvent(overrides?: Record<string, unknown>): Record<string, unknown> {
        return {
            eventId: '30000000-0000-4000-8000-000000000001',
            type: 'NPC.Tick',
            occurredUtc: '2025-11-25T12:01:00.000Z',
            actor: { kind: 'system' },
            correlationId: '40000000-0000-4000-8000-000000000001',
            idempotencyKey: 'npc:tick:test-npc:1',
            version: 1,
            payload: {
                npcId: 'npc-1',
                locationId: 'loc-a'
            },
            ...overrides
        }
    }

    test('should invoke ExitCreateHandler and emit handler telemetry (success)', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createExitCreateEvent({ idempotencyKey: 'exit:loc-a:north:success' })
        await queueProcessWorldEvent(event, ctx as any)

        // Verify handler log
        const logs = ctx.getLogs()
        const handlerLog = logs.find((l) => l[0] === 'ExitCreateHandler applied')
        assert.ok(handlerLog, 'ExitCreateHandler should apply exit creation')

        // Verify telemetry emission
        const invokedEvents = telemetry.events.filter((e) => e.name === 'World.Event.HandlerInvoked')
        assert.ok(invokedEvents.length > 0, 'World.Event.HandlerInvoked telemetry should be emitted')
        const success = invokedEvents.find((e) => e.properties?.outcome === 'success' || e.properties?.outcome === 'noop')
        assert.ok(success, 'Handler success or noop outcome should be recorded')
    })

    test('should emit validation-failed outcome for missing payload fields', async () => {
        const ctx = await fixture.createInvocationContext()
        const invalidEvent = createExitCreateEvent({
            idempotencyKey: 'exit:loc-a:north:validation',
            payload: { fromLocationId: 'loc-a' } // missing toLocationId & direction
        })
        await queueProcessWorldEvent(invalidEvent, ctx as any)

        const invokedEvents = telemetry.events.filter((e) => e.name === 'World.Event.HandlerInvoked')
        const validation = invokedEvents.find((e) => e.properties?.outcome === 'validation-failed')
        assert.ok(validation, 'Validation failure should emit handler telemetry outcome validation-failed')
    })

    test('should bubble transient repository error and emit error outcome', async () => {
        // Replace locationRepo ensureExitBidirectional with throwing stub
        // @ts-expect-error - overriding mocked method for error simulation
        locationRepo.ensureExitBidirectional = async () => {
            throw new Error('transient failure')
        }
        const ctx = await fixture.createInvocationContext()
        const event = createExitCreateEvent({ idempotencyKey: 'exit:loc-a:north:error' })
        let threw = false
        try {
            await queueProcessWorldEvent(event, ctx as any)
        } catch {
            threw = true
        }
        assert.ok(threw, 'Transient error should bubble to trigger retry semantics')
        const errorTelemetry = telemetry.events.find((e) => e.name === 'World.Event.HandlerInvoked' && e.properties?.outcome === 'error')
        assert.ok(errorTelemetry, 'Error outcome telemetry should be emitted')
    })

    test('should invoke NPCTickHandler and emit success outcome', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createNpcTickEvent({ idempotencyKey: 'npc:tick:test-npc:success' })
        await queueProcessWorldEvent(event, ctx as any)
        const handlerLog = ctx.getLogs().find((l) => l[0] === 'NPCTickHandler tick processed')
        assert.ok(handlerLog, 'NPCTickHandler should process tick')
        const successTelemetry = telemetry.events.find(
            (e) => e.name === 'World.Event.HandlerInvoked' && e.properties?.handler === 'NPCTickHandler'
        )
        assert.ok(successTelemetry, 'NPCTickHandler should emit handler invoked telemetry')
    })

    test('should not emit HandlerInvoked for unhandled event type', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createNpcTickEvent({
            type: 'Quest.Proposed',
            idempotencyKey: 'quest:proposed:q1',
            payload: { questId: 'q1', seedHash: 'abc' }
        })
        await queueProcessWorldEvent(event, ctx as any)
        const noHandlerLog = ctx.getLogs().find((l) => l[0] === 'No type-specific handler registered for event type')
        assert.ok(noHandlerLog, 'Should log lack of handler')
        const handlerTelemetry = telemetry.events.filter((e) => e.name === 'World.Event.HandlerInvoked')
        const questTelemetry = handlerTelemetry.find((e) => e.properties?.eventType === 'Quest.Proposed')
        assert.ok(!questTelemetry, 'No handler telemetry should be emitted for unknown type')
    })
})
