/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for BatchGenerateHandler (Issue #759 - BatchGenerateHandler foundation)
 *
 * TDD-driven test suite validating:
 * - Event payload validation (happy + edge cases)
 * - Telemetry emission (Started, Completed, Failed)
 * - Correlation ID propagation
 * - Idempotency behavior
 *
 * Design Philosophy (per tenets.md #7):
 * - Handler scaffold only; no world mutations yet (deferred to #761)
 * - Deterministic code captures state; AI creates immersion
 */
import assert from 'node:assert'
import { beforeEach, describe, test } from 'node:test'
import { queueProcessWorldEvent } from '../../src/worldEvents/queueProcessWorldEvent.js'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'
import type { MockTelemetryClient } from '../mocks/MockTelemetryClient.js'

describe('BatchGenerateHandler', () => {
    let fixture: UnitTestFixture
    let telemetry: MockTelemetryClient

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
        telemetry = await fixture.getTelemetryClient()
    })

    /**
     * Helper to create a valid batch generate event payload
     */
    function createBatchGenerateEvent(overrides?: Record<string, unknown>): Record<string, unknown> {
        return {
            eventId: '10000000-0000-4000-8000-000000000001',
            type: 'World.Location.BatchGenerate',
            occurredUtc: '2025-11-25T12:00:00.000Z',
            actor: { kind: 'system', id: '20000000-0000-4000-8000-000000000002' },
            correlationId: '30000000-0000-4000-8000-000000000003',
            idempotencyKey: 'batch:loc-root:dense-forest:1',
            version: 1,
            payload: {
                rootLocationId: '40000000-0000-4000-8000-000000000004',
                terrain: 'dense-forest',
                arrivalDirection: 'north',
                expansionDepth: 2,
                batchSize: 5
            },
            ...overrides
        }
    }

    test('happy path: valid payload emits Started and Completed telemetry', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createBatchGenerateEvent({ idempotencyKey: 'batch:happy:path' })
        await queueProcessWorldEvent(event, ctx as any)

        // Verify Started telemetry
        const started = telemetry.events.find((e) => e.name === 'World.BatchGeneration.Started')
        assert.ok(started, 'BatchGeneration.Started telemetry should be emitted')
        assert.strictEqual(started?.properties?.rootLocationId, '40000000-0000-4000-8000-000000000004')
        assert.strictEqual(started?.properties?.batchSize, 5)
        assert.strictEqual(started?.properties?.terrain, 'dense-forest')
        assert.strictEqual(started?.properties?.correlationId, '30000000-0000-4000-8000-000000000003')

        // Verify Completed telemetry
        const completed = telemetry.events.find((e) => e.name === 'World.BatchGeneration.Completed')
        assert.ok(completed, 'BatchGeneration.Completed telemetry should be emitted')
        assert.strictEqual(completed?.properties?.rootLocationId, '40000000-0000-4000-8000-000000000004')
        assert.strictEqual(completed?.properties?.correlationId, '30000000-0000-4000-8000-000000000003')

        // Verify HandlerInvoked success outcome
        const handlerInvoked = telemetry.events.find((e) => e.name === 'World.Event.HandlerInvoked' && e.properties?.outcome === 'success')
        assert.ok(handlerInvoked, 'HandlerInvoked success telemetry should be emitted')
        assert.strictEqual(handlerInvoked?.properties?.handler, 'BatchGenerateHandler')
    })

    test('validation failure: invalid rootLocationId UUID format', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createBatchGenerateEvent({
            idempotencyKey: 'batch:invalid:uuid',
            payload: {
                rootLocationId: 'not-a-uuid',
                terrain: 'forest',
                arrivalDirection: 'north',
                expansionDepth: 2,
                batchSize: 5
            }
        })
        await queueProcessWorldEvent(event, ctx as any)

        // Verify validation-failed outcome
        const handlerInvoked = telemetry.events.find(
            (e) => e.name === 'World.Event.HandlerInvoked' && e.properties?.outcome === 'validation-failed'
        )
        assert.ok(handlerInvoked, 'HandlerInvoked validation-failed telemetry should be emitted')

        // Verify no Started or Completed events
        const started = telemetry.events.find((e) => e.name === 'World.BatchGeneration.Started')
        assert.strictEqual(started, undefined, 'Should not emit Started for invalid payload')
    })

    test('validation failure: terrain not in enum', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createBatchGenerateEvent({
            idempotencyKey: 'batch:invalid:terrain',
            payload: {
                rootLocationId: '40000000-0000-4000-8000-000000000004',
                terrain: 'invalid-terrain-type',
                arrivalDirection: 'north',
                expansionDepth: 2,
                batchSize: 5
            }
        })
        await queueProcessWorldEvent(event, ctx as any)

        // Verify validation-failed outcome
        const handlerInvoked = telemetry.events.find(
            (e) => e.name === 'World.Event.HandlerInvoked' && e.properties?.outcome === 'validation-failed'
        )
        assert.ok(handlerInvoked, 'HandlerInvoked validation-failed for invalid terrain should be emitted')
    })

    test('validation failure: arrivalDirection invalid', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createBatchGenerateEvent({
            idempotencyKey: 'batch:invalid:direction',
            payload: {
                rootLocationId: '40000000-0000-4000-8000-000000000004',
                terrain: 'forest',
                arrivalDirection: 'sideways',
                expansionDepth: 2,
                batchSize: 5
            }
        })
        await queueProcessWorldEvent(event, ctx as any)

        // Verify validation-failed outcome
        const handlerInvoked = telemetry.events.find(
            (e) => e.name === 'World.Event.HandlerInvoked' && e.properties?.outcome === 'validation-failed'
        )
        assert.ok(handlerInvoked, 'HandlerInvoked validation-failed for invalid direction should be emitted')
    })

    test('validation failure: expansionDepth > 3', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createBatchGenerateEvent({
            idempotencyKey: 'batch:invalid:depth',
            payload: {
                rootLocationId: '40000000-0000-4000-8000-000000000004',
                terrain: 'forest',
                arrivalDirection: 'north',
                expansionDepth: 4,
                batchSize: 5
            }
        })
        await queueProcessWorldEvent(event, ctx as any)

        // Verify validation-failed outcome
        const handlerInvoked = telemetry.events.find(
            (e) => e.name === 'World.Event.HandlerInvoked' && e.properties?.outcome === 'validation-failed'
        )
        assert.ok(handlerInvoked, 'HandlerInvoked validation-failed for expansionDepth > 3 should be emitted')
    })

    test('validation failure: batchSize > 20', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createBatchGenerateEvent({
            idempotencyKey: 'batch:invalid:batchsize',
            payload: {
                rootLocationId: '40000000-0000-4000-8000-000000000004',
                terrain: 'forest',
                arrivalDirection: 'north',
                expansionDepth: 2,
                batchSize: 21
            }
        })
        await queueProcessWorldEvent(event, ctx as any)

        // Verify validation-failed outcome
        const handlerInvoked = telemetry.events.find(
            (e) => e.name === 'World.Event.HandlerInvoked' && e.properties?.outcome === 'validation-failed'
        )
        assert.ok(handlerInvoked, 'HandlerInvoked validation-failed for batchSize > 20 should be emitted')
    })

    test('validation failure: expansionDepth < 1', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createBatchGenerateEvent({
            idempotencyKey: 'batch:invalid:depth-zero',
            payload: {
                rootLocationId: '40000000-0000-4000-8000-000000000004',
                terrain: 'forest',
                arrivalDirection: 'north',
                expansionDepth: 0,
                batchSize: 5
            }
        })
        await queueProcessWorldEvent(event, ctx as any)

        // Verify validation-failed outcome
        const handlerInvoked = telemetry.events.find(
            (e) => e.name === 'World.Event.HandlerInvoked' && e.properties?.outcome === 'validation-failed'
        )
        assert.ok(handlerInvoked, 'HandlerInvoked validation-failed for expansionDepth < 1 should be emitted')
    })

    test('validation failure: batchSize < 1', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createBatchGenerateEvent({
            idempotencyKey: 'batch:invalid:batchsize-zero',
            payload: {
                rootLocationId: '40000000-0000-4000-8000-000000000004',
                terrain: 'forest',
                arrivalDirection: 'north',
                expansionDepth: 2,
                batchSize: 0
            }
        })
        await queueProcessWorldEvent(event, ctx as any)

        // Verify validation-failed outcome
        const handlerInvoked = telemetry.events.find(
            (e) => e.name === 'World.Event.HandlerInvoked' && e.properties?.outcome === 'validation-failed'
        )
        assert.ok(handlerInvoked, 'HandlerInvoked validation-failed for batchSize < 1 should be emitted')
    })

    test('correlation ID propagates to Started and Completed telemetry', async () => {
        const correlationId = '99999999-0000-4000-8000-000000000099'
        const ctx = await fixture.createInvocationContext()
        const event = createBatchGenerateEvent({
            correlationId,
            idempotencyKey: 'batch:correlation:test'
        })
        await queueProcessWorldEvent(event, ctx as any)

        // Verify Started has correlationId
        const started = telemetry.events.find((e) => e.name === 'World.BatchGeneration.Started')
        assert.strictEqual(started?.properties?.correlationId, correlationId, 'Started should have correlationId')

        // Verify Completed has correlationId
        const completed = telemetry.events.find((e) => e.name === 'World.BatchGeneration.Completed')
        assert.strictEqual(completed?.properties?.correlationId, correlationId, 'Completed should have correlationId')

        // Verify HandlerInvoked has correlationId
        const handlerInvoked = telemetry.events.find((e) => e.name === 'World.Event.HandlerInvoked' && e.properties?.outcome === 'success')
        assert.strictEqual(handlerInvoked?.properties?.correlationId, correlationId, 'HandlerInvoked should have correlationId')
    })

    test('idempotency: same event detected as duplicate within TTL', async () => {
        const idempotencyKey = 'batch:idempotent:test'
        const event = createBatchGenerateEvent({ idempotencyKey })

        // Baseline event count before test
        const baselineStartedCount = telemetry.events.filter((e) => e.name === 'World.BatchGeneration.Started').length
        const baselineDuplicateCount = telemetry.events.filter((e) => e.name === 'World.Event.Duplicate').length

        // First invocation
        const ctx1 = await fixture.createInvocationContext()
        await queueProcessWorldEvent(event, ctx1 as any)

        const started1 = telemetry.events.filter((e) => e.name === 'World.BatchGeneration.Started').length
        assert.strictEqual(started1 - baselineStartedCount, 1, 'First invocation should emit Started')

        // Second invocation with same idempotencyKey (should be detected as duplicate)
        const ctx2 = await fixture.createInvocationContext()
        await queueProcessWorldEvent(event, ctx2 as any)

        const started2 = telemetry.events.filter((e) => e.name === 'World.BatchGeneration.Started').length
        const duplicateCount = telemetry.events.filter((e) => e.name === 'World.Event.Duplicate').length

        // Second invocation should be detected as duplicate and not re-process
        assert.strictEqual(
            started2 - baselineStartedCount,
            1,
            'Second invocation should be detected as duplicate, not emit new Started'
        )
        assert.strictEqual(
            duplicateCount - baselineDuplicateCount,
            1,
            'Duplicate event telemetry should be emitted for second invocation'
        )
    })
})
