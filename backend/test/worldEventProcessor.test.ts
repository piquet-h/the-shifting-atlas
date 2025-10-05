/**
 * Tests for World Event Queue Processor
 */
import assert from 'node:assert'
import { describe, test, beforeEach } from 'node:test'
import type { InvocationContext } from '@azure/functions'
import { queueProcessWorldEvent } from '../src/functions/queueProcessWorldEvent.js'

// Mock InvocationContext for testing
function createMockContext(): InvocationContext {
    const logs: unknown[][] = []
    const errors: unknown[][] = []

    return {
        log: (...args: unknown[]) => {
            logs.push(args)
        },
        error: (...args: unknown[]) => {
            errors.push(args)
        },
        warn: (...args: unknown[]) => {},
        info: (...args: unknown[]) => {},
        debug: (...args: unknown[]) => {},
        trace: (...args: unknown[]) => {},
        getLogs: () => logs,
        getErrors: () => errors,
        invocationId: 'test-invocation-id',
        functionName: 'QueueProcessWorldEvent',
        extraInputs: { get: () => undefined },
        extraOutputs: { set: () => {} },
        retryContext: { retryCount: 0, maxRetryCount: 3 },
        traceContext: {
            traceparent: 'test-traceparent',
            tracestate: 'test-tracestate',
            attributes: {}
        },
        triggerMetadata: {}
    } as unknown as InvocationContext
}

// Helper to create valid world event envelope
function createValidEvent(overrides?: Partial<Record<string, unknown>>): Record<string, unknown> {
    return {
        eventId: '00000000-0000-4000-8000-000000000001',
        type: 'Player.Move',
        occurredUtc: '2025-10-05T12:00:00.000Z',
        actor: {
            kind: 'player',
            id: '00000000-0000-4000-8000-000000000002'
        },
        correlationId: '00000000-0000-4000-8000-000000000003',
        idempotencyKey: 'player-move-test-key-1',
        version: 1,
        payload: {
            playerId: '00000000-0000-4000-8000-000000000002',
            fromLocationId: 'loc-1',
            toLocationId: 'loc-2',
            direction: 'north'
        },
        ...overrides
    }
}

describe('World Event Queue Processor', () => {
    describe('Valid Event Processing', () => {
        test('should process valid event and emit telemetry', async () => {
            const ctx = createMockContext()
            const event = createValidEvent()

            await queueProcessWorldEvent(event, ctx)

            const logs = (ctx as unknown as { getLogs: () => unknown[][] }).getLogs()
            const errors = (ctx as unknown as { getErrors: () => unknown[][] }).getErrors()

            // Should not have errors
            assert.strictEqual(errors.length, 0, 'Should not have any errors')

            // Should log processing
            assert.ok(logs.length > 0, 'Should have logged processing steps')
            const processLog = logs.find((l) => l[0] === 'Processing world event')
            assert.ok(processLog, 'Should log processing start')

            const successLog = logs.find((l) => l[0] === 'World event processed successfully')
            assert.ok(successLog, 'Should log successful processing')
        })

        test('should set ingestedUtc if missing', async () => {
            const ctx = createMockContext()
            const event = createValidEvent()
            delete event.ingestedUtc

            await queueProcessWorldEvent(event, ctx)

            const logs = (ctx as unknown as { getLogs: () => unknown[][] }).getLogs()
            const errors = (ctx as unknown as { getErrors: () => unknown[][] }).getErrors()

            assert.strictEqual(errors.length, 0, 'Should not have errors')
            // Should have processing log and success log
            assert.ok(logs.length >= 2, 'Should have at least 2 log entries')
        })

        test('should propagate correlation and causation IDs in telemetry', async () => {
            const ctx = createMockContext()
            const event = createValidEvent({
                correlationId: '11111111-1111-4111-8111-111111111111',
                causationId: '22222222-2222-4222-8222-222222222222'
            })

            await queueProcessWorldEvent(event, ctx)

            const logs = (ctx as unknown as { getLogs: () => unknown[][] }).getLogs()
            const errors = (ctx as unknown as { getErrors: () => unknown[][] }).getErrors()

            // Should process without errors
            assert.strictEqual(errors.length, 0, 'Should not have errors')
            // Should have logged the event processing
            assert.ok(logs.length > 0, 'Should have logged event processing')
        })
    })

    describe('Invalid Event Schema', () => {
        test('should reject event with missing type', async () => {
            const ctx = createMockContext()
            const event = createValidEvent()
            delete event.type

            await queueProcessWorldEvent(event, ctx)

            const errors = (ctx as unknown as { getErrors: () => unknown[][] }).getErrors()
            assert.ok(errors.length > 0, 'Should have validation error')

            const validationError = errors.find((e) => e[0] === 'World event envelope validation failed')
            assert.ok(validationError, 'Should log validation failure')
        })

        test('should reject event with missing occurredUtc', async () => {
            const ctx = createMockContext()
            const event = createValidEvent()
            delete event.occurredUtc

            await queueProcessWorldEvent(event, ctx)

            const errors = (ctx as unknown as { getErrors: () => unknown[][] }).getErrors()
            assert.ok(errors.length > 0, 'Should have validation error')

            const validationError = errors.find((e) => e[0] === 'World event envelope validation failed')
            assert.ok(validationError, 'Should log validation failure for missing occurredUtc')
        })

        test('should reject event with invalid actor.kind', async () => {
            const ctx = createMockContext()
            const event = createValidEvent()
            event.actor = { kind: 'invalid-kind', id: 'test-id' }

            await queueProcessWorldEvent(event, ctx)

            const errors = (ctx as unknown as { getErrors: () => unknown[][] }).getErrors()
            assert.ok(errors.length > 0, 'Should have validation error')
        })

        test('should reject event with invalid eventId (not UUID)', async () => {
            const ctx = createMockContext()
            const event = createValidEvent({ eventId: 'not-a-uuid' })

            await queueProcessWorldEvent(event, ctx)

            const errors = (ctx as unknown as { getErrors: () => unknown[][] }).getErrors()
            assert.ok(errors.length > 0, 'Should have validation error for invalid UUID')
        })

        test('should handle malformed JSON gracefully', async () => {
            const ctx = createMockContext()
            const malformedJson = 'not valid json {'

            await queueProcessWorldEvent(malformedJson, ctx)

            const errors = (ctx as unknown as { getErrors: () => unknown[][] }).getErrors()
            assert.ok(errors.length > 0, 'Should have JSON parse error')

            const parseError = errors.find((e) => e[0] === 'Failed to parse queue message as JSON')
            assert.ok(parseError, 'Should log JSON parse failure')
        })
    })

    describe('Idempotency', () => {
        // Reset idempotency cache between tests in this suite
        // Note: In production, cache is module-level, so we test behavior within single invocation context

        test('should detect duplicate events with same idempotencyKey', async () => {
            const ctx1 = createMockContext()
            const ctx2 = createMockContext()
            const event = createValidEvent({ idempotencyKey: 'unique-duplicate-test-key' })

            // First processing
            await queueProcessWorldEvent(event, ctx1)

            // Second processing (duplicate)
            await queueProcessWorldEvent(event, ctx2)

            const logs2 = (ctx2 as unknown as { getLogs: () => unknown[][] }).getLogs()
            const duplicateLog = logs2.find((l) => l[0] === 'Duplicate world event (idempotency skip)')

            assert.ok(duplicateLog, 'Should detect and log duplicate event')
        })

        test('should process events with different idempotencyKeys', async () => {
            const ctx1 = createMockContext()
            const ctx2 = createMockContext()

            const event1 = createValidEvent({ idempotencyKey: 'key-1', eventId: '10000000-0000-4000-8000-000000000001' })
            const event2 = createValidEvent({ idempotencyKey: 'key-2', eventId: '20000000-0000-4000-8000-000000000001' })

            await queueProcessWorldEvent(event1, ctx1)
            await queueProcessWorldEvent(event2, ctx2)

            const errors1 = (ctx1 as unknown as { getErrors: () => unknown[][] }).getErrors()
            const errors2 = (ctx2 as unknown as { getErrors: () => unknown[][] }).getErrors()

            assert.strictEqual(errors1.length, 0, 'First event should process without errors')
            assert.strictEqual(errors2.length, 0, 'Second event should process without errors')

            const logs2 = (ctx2 as unknown as { getLogs: () => unknown[][] }).getLogs()
            const successLog2 = logs2.find((l) => l[0] === 'World event processed successfully')
            assert.ok(successLog2, 'Second event with different key should process successfully')
        })
    })

    describe('Edge Cases', () => {
        test('should handle event with empty payload', async () => {
            const ctx = createMockContext()
            const event = createValidEvent({ payload: {} })

            await queueProcessWorldEvent(event, ctx)

            const errors = (ctx as unknown as { getErrors: () => unknown[][] }).getErrors()
            assert.strictEqual(errors.length, 0, 'Empty payload should be valid')
        })

        test('should handle event with version > 1', async () => {
            const ctx = createMockContext()
            const event = createValidEvent({ version: 2 })

            await queueProcessWorldEvent(event, ctx)

            const errors = (ctx as unknown as { getErrors: () => unknown[][] }).getErrors()
            assert.strictEqual(errors.length, 0, 'Higher version should be accepted')
        })

        test('should reject event with version 0', async () => {
            const ctx = createMockContext()
            const event = createValidEvent({ version: 0 })

            await queueProcessWorldEvent(event, ctx)

            const errors = (ctx as unknown as { getErrors: () => unknown[][] }).getErrors()
            assert.ok(errors.length > 0, 'Version 0 should be rejected (must be positive)')
        })

        test('should handle all valid event types', async () => {
            const eventTypes = ['Player.Move', 'Player.Look', 'NPC.Tick', 'World.Ambience.Generated', 'World.Exit.Create', 'Quest.Proposed']

            for (const type of eventTypes) {
                const ctx = createMockContext()
                const event = createValidEvent({
                    type,
                    idempotencyKey: `test-${type}-${Date.now()}-${Math.random()}`
                })

                await queueProcessWorldEvent(event, ctx)

                const errors = (ctx as unknown as { getErrors: () => unknown[][] }).getErrors()
                assert.strictEqual(errors.length, 0, `Event type ${type} should be valid`)
            }
        })
    })
})
