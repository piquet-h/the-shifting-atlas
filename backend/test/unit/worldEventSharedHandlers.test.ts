/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for LocationFireHandler (Issue #258 - Shared World Effect Handler)
 */
import type { Container } from 'inversify'
import assert from 'node:assert'
import { beforeEach, describe, test } from 'node:test'
import { queueProcessWorldEvent } from '../../src/handlers/queueProcessWorldEvent.js'
import type { IDescriptionRepository } from '../../src/repos/descriptionRepository.js'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'
import type { MockTelemetryClient } from '../mocks/MockTelemetryClient.js'

describe('LocationFireHandler', () => {
    let fixture: UnitTestFixture
    let container: Container
    let telemetry: MockTelemetryClient
    let descriptionRepo: IDescriptionRepository

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
        container = await fixture.getContainer()
        telemetry = await fixture.getTelemetryClient()
        descriptionRepo = container.get<IDescriptionRepository>('IDescriptionRepository')
    })

    function createFireEvent(overrides?: Record<string, unknown>): Record<string, unknown> {
        return {
            eventId: '10000000-0000-4000-8000-000000000001',
            type: 'Location.Fire.Started',
            occurredUtc: '2025-11-25T12:00:00.000Z',
            actor: { kind: 'player', id: '20000000-0000-4000-8000-000000000002' },
            correlationId: '30000000-0000-4000-8000-000000000003',
            idempotencyKey: 'fire:loc-forest:1',
            version: 1,
            payload: {
                locationId: 'loc-forest',
                intensity: 'moderate',
                spreadRadius: 2
            },
            ...overrides
        }
    }

    test('should add fire description layer on valid event (success)', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createFireEvent({ idempotencyKey: 'fire:loc-forest:success' })
        await queueProcessWorldEvent(event, ctx as any)

        const logs = ctx.getLogs()
        const handlerLog = logs.find((l) => l[0] === 'LocationFireHandler applied')
        assert.ok(handlerLog, 'LocationFireHandler should apply fire layer')
        assert.ok(handlerLog[1].created, 'Layer should be created')

        const layers = await descriptionRepo.getLayersForLocation('loc-forest')
        assert.strictEqual(layers.length, 1, 'Should have one description layer')
        assert.strictEqual(layers[0].type, 'structural_event', 'Layer type should be structural_event')
        assert.ok(layers[0].content.includes('Fire'), 'Content should mention fire')
    })

    test('should emit HandlerInvoked telemetry with success outcome', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createFireEvent({ idempotencyKey: 'fire:loc-forest:telemetry' })
        await queueProcessWorldEvent(event, ctx as any)

        const invokedEvents = telemetry.events.filter((e) => e.name === 'World.Event.HandlerInvoked')
        const success = invokedEvents.find((e) => e.properties?.handler === 'LocationFireHandler' && e.properties?.outcome === 'success')
        assert.ok(success, 'Handler success telemetry should be emitted')
    })

    test('should emit validation-failed for missing locationId', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createFireEvent({
            idempotencyKey: 'fire:missing-loc:validation',
            payload: { intensity: 'high', spreadRadius: 1 }
        })
        await queueProcessWorldEvent(event, ctx as any)

        const invokedEvents = telemetry.events.filter((e) => e.name === 'World.Event.HandlerInvoked')
        const validation = invokedEvents.find(
            (e) => e.properties?.handler === 'LocationFireHandler' && e.properties?.outcome === 'validation-failed'
        )
        assert.ok(validation, 'Validation failure telemetry should be emitted')
    })

    test('should emit validation-failed for missing intensity', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createFireEvent({
            idempotencyKey: 'fire:missing-intensity:validation',
            payload: { locationId: 'loc-test', spreadRadius: 1 }
        })
        await queueProcessWorldEvent(event, ctx as any)

        const invokedEvents = telemetry.events.filter((e) => e.name === 'World.Event.HandlerInvoked')
        const validation = invokedEvents.find(
            (e) => e.properties?.handler === 'LocationFireHandler' && e.properties?.outcome === 'validation-failed'
        )
        assert.ok(validation, 'Validation failure for missing intensity should be emitted')
    })

    test('should emit validation-failed for invalid intensity value', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createFireEvent({
            idempotencyKey: 'fire:invalid-intensity:validation',
            payload: { locationId: 'loc-test', intensity: 'extreme', spreadRadius: 1 }
        })
        await queueProcessWorldEvent(event, ctx as any)

        const invokedEvents = telemetry.events.filter((e) => e.name === 'World.Event.HandlerInvoked')
        const validation = invokedEvents.find(
            (e) => e.properties?.handler === 'LocationFireHandler' && e.properties?.outcome === 'validation-failed'
        )
        assert.ok(validation, 'Validation failure for invalid intensity should be emitted')
    })

    test('should handle low intensity fire description', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createFireEvent({
            idempotencyKey: 'fire:low-intensity',
            payload: { locationId: 'loc-low', intensity: 'low', spreadRadius: 1 }
        })
        await queueProcessWorldEvent(event, ctx as any)

        const layers = await descriptionRepo.getLayersForLocation('loc-low')
        assert.strictEqual(layers.length, 1, 'Should have one layer')
        assert.ok(layers[0].content.includes('Small flames'), 'Low intensity description should mention small flames')
    })

    test('should handle high intensity fire description', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createFireEvent({
            idempotencyKey: 'fire:high-intensity',
            payload: { locationId: 'loc-high', intensity: 'high', spreadRadius: 3 }
        })
        await queueProcessWorldEvent(event, ctx as any)

        const layers = await descriptionRepo.getLayersForLocation('loc-high')
        assert.strictEqual(layers.length, 1, 'Should have one layer')
        assert.ok(layers[0].content.includes('inferno'), 'High intensity description should mention inferno')
    })

    test('should store layer with correct attributes', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createFireEvent({
            idempotencyKey: 'fire:attributes-check',
            payload: { locationId: 'loc-attrs', intensity: 'moderate', spreadRadius: 5 }
        })
        await queueProcessWorldEvent(event, ctx as any)

        const layers = await descriptionRepo.getLayersForLocation('loc-attrs')
        assert.strictEqual(layers.length, 1, 'Should have one layer')
        assert.strictEqual(layers[0].attributes?.intensity, 'moderate', 'Intensity attribute should match')
        assert.strictEqual(layers[0].attributes?.spreadRadius, 5, 'SpreadRadius attribute should match')
        assert.strictEqual(layers[0].source, 'world-event:Location.Fire.Started', 'Source should indicate world event')
    })

    test('should bubble repository errors for retry', async () => {
        const failingRepo: IDescriptionRepository = {
            async getLayersForLocation() {
                return []
            },
            async addLayer() {
                throw new Error('Cosmos transient failure')
            },
            async archiveLayer() {
                return { archived: false }
            },
            async getLayersForLocations() {
                return new Map()
            },
            async getAllLayers() {
                return []
            },
            async updateIntegrityHash() {
                return { updated: false }
            }
        }

        container.unbind('IDescriptionRepository')
        container.bind<IDescriptionRepository>('IDescriptionRepository').toConstantValue(failingRepo)

        const ctx = await fixture.createInvocationContext()
        const event = createFireEvent({ idempotencyKey: 'fire:error-bubble' })
        let threw = false
        try {
            await queueProcessWorldEvent(event, ctx as any)
        } catch {
            threw = true
        }
        assert.ok(threw, 'Repository error should bubble for retry')

        const errorTelemetry = telemetry.events.find(
            (e) =>
                e.name === 'World.Event.HandlerInvoked' &&
                e.properties?.handler === 'LocationFireHandler' &&
                e.properties?.outcome === 'error'
        )
        assert.ok(errorTelemetry, 'Error outcome telemetry should be emitted')
    })
})

describe('NPCAwarenessHandler', () => {
    let fixture: UnitTestFixture
    let telemetry: MockTelemetryClient

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
        telemetry = await fixture.getTelemetryClient()
    })

    function createAwarenessEvent(overrides?: Record<string, unknown>): Record<string, unknown> {
        return {
            eventId: '40000000-0000-4000-8000-000000000001',
            type: 'NPC.Awareness',
            occurredUtc: '2025-11-25T12:00:00.000Z',
            actor: { kind: 'system' },
            correlationId: '50000000-0000-4000-8000-000000000002',
            idempotencyKey: 'npc:awareness:guard:1',
            version: 1,
            payload: {
                npcId: 'npc-guard',
                locationId: 'loc-tavern',
                triggeredByPlayerId: '60000000-0000-4000-8000-000000000003',
                reason: 'player-entered'
            },
            ...overrides
        }
    }

    test('should process NPC awareness and emit success telemetry', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createAwarenessEvent({ idempotencyKey: 'npc:awareness:success' })
        await queueProcessWorldEvent(event, ctx as any)

        const logs = ctx.getLogs()
        const handlerLog = logs.find((l) => l[0] === 'NPCAwarenessHandler processed')
        assert.ok(handlerLog, 'NPCAwarenessHandler should process event')

        const invokedEvents = telemetry.events.filter((e) => e.name === 'World.Event.HandlerInvoked')
        const success = invokedEvents.find((e) => e.properties?.handler === 'NPCAwarenessHandler' && e.properties?.outcome === 'success')
        assert.ok(success, 'Handler success telemetry should be emitted')
    })

    test('should emit validation-failed for missing npcId', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createAwarenessEvent({
            idempotencyKey: 'npc:awareness:missing-npc',
            payload: { locationId: 'loc-test' }
        })
        await queueProcessWorldEvent(event, ctx as any)

        const invokedEvents = telemetry.events.filter((e) => e.name === 'World.Event.HandlerInvoked')
        const validation = invokedEvents.find(
            (e) => e.properties?.handler === 'NPCAwarenessHandler' && e.properties?.outcome === 'validation-failed'
        )
        assert.ok(validation, 'Validation failure for missing npcId should be emitted')
    })

    test('should emit validation-failed for missing locationId', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createAwarenessEvent({
            idempotencyKey: 'npc:awareness:missing-loc',
            payload: { npcId: 'npc-test' }
        })
        await queueProcessWorldEvent(event, ctx as any)

        const invokedEvents = telemetry.events.filter((e) => e.name === 'World.Event.HandlerInvoked')
        const validation = invokedEvents.find(
            (e) => e.properties?.handler === 'NPCAwarenessHandler' && e.properties?.outcome === 'validation-failed'
        )
        assert.ok(validation, 'Validation failure for missing locationId should be emitted')
    })

    test('should include optional triggeredByPlayerId in telemetry', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createAwarenessEvent({ idempotencyKey: 'npc:awareness:player-trigger' })
        await queueProcessWorldEvent(event, ctx as any)

        const invokedEvents = telemetry.events.filter((e) => e.name === 'World.Event.HandlerInvoked')
        const success = invokedEvents.find((e) => e.properties?.handler === 'NPCAwarenessHandler' && e.properties?.outcome === 'success')
        assert.ok(success, 'Handler success should be emitted')
        assert.strictEqual(
            success?.properties?.triggeredByPlayerId,
            '60000000-0000-4000-8000-000000000003',
            'PlayerId should be in telemetry'
        )
    })

    test('should work without optional fields', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createAwarenessEvent({
            idempotencyKey: 'npc:awareness:minimal',
            payload: { npcId: 'npc-minimal', locationId: 'loc-minimal' }
        })
        await queueProcessWorldEvent(event, ctx as any)

        const logs = ctx.getLogs()
        const handlerLog = logs.find((l) => l[0] === 'NPCAwarenessHandler processed')
        assert.ok(handlerLog, 'Handler should process minimal payload')
    })
})
