/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for World Event Queue Processor
 */
import type { Container } from 'inversify'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { IDeadLetterRepository } from '../../src/repos/deadLetterRepository.js'
import { __resetIdempotencyCacheForTests, queueProcessWorldEvent } from '../../src/worldEvents/queueProcessWorldEvent'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'

describe('World Event Queue Processor', () => {
    let fixture: UnitTestFixture

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

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

    describe('Valid Event Processing', () => {
        test('should process valid event and emit telemetry', async () => {
            const ctx = await fixture.createInvocationContext()
            const event = createValidEvent()

            await queueProcessWorldEvent(event, ctx as any)

            const logs = ctx.getLogs()
            const errors = ctx.getErrors()

            assert.strictEqual(errors.length, 0, 'Should not have any errors')
            assert.ok(logs.length > 0, 'Should have logged processing steps')
            const processLog = logs.find((l) => l[0] === 'Processing world event')
            assert.ok(processLog, 'Should log processing start')
            const successLog = logs.find((l) => l[0] === 'World event processed successfully')
            assert.ok(successLog, 'Should log successful processing')
        })

        test('should set ingestedUtc if missing', async () => {
            const ctx = await fixture.createInvocationContext()
            const event = createValidEvent()
            delete (event as any).ingestedUtc

            await queueProcessWorldEvent(event, ctx as any)

            const logs = ctx.getLogs()
            const errors = ctx.getErrors()
            assert.strictEqual(errors.length, 0, 'Should not have errors')
            assert.ok(logs.length >= 2, 'Should have at least 2 log entries')
        })

        test('should propagate correlation and causation IDs in telemetry', async () => {
            const ctx = await fixture.createInvocationContext()
            const event = createValidEvent({
                correlationId: '11111111-1111-4111-8111-111111111111',
                causationId: '22222222-2222-4222-8222-222222222222'
            })

            await queueProcessWorldEvent(event, ctx as any)

            const logs = ctx.getLogs()
            const errors = ctx.getErrors()
            assert.strictEqual(errors.length, 0, 'Should not have errors')
            assert.ok(logs.length > 0, 'Should have logged event processing')
        })
    })

    describe('Invalid Event Schema', () => {
        test('should reject event with missing type', async () => {
            const ctx = await fixture.createInvocationContext()
            const event = createValidEvent()
            delete (event as any).type

            await queueProcessWorldEvent(event, ctx as any)

            const errors = ctx.getErrors()
            assert.ok(errors.length > 0, 'Should have validation error')
            const validationError = errors.find((e) => e[0] === 'World event envelope validation failed')
            assert.ok(validationError, 'Should log validation failure')
        })

        test('should reject event with missing occurredUtc', async () => {
            const ctx = await fixture.createInvocationContext()
            const event = createValidEvent()
            delete (event as any).occurredUtc

            await queueProcessWorldEvent(event, ctx as any)

            const errors = ctx.getErrors()
            assert.ok(errors.length > 0, 'Should have validation error')
            const validationError = errors.find((e) => e[0] === 'World event envelope validation failed')
            assert.ok(validationError, 'Should log validation failure for missing occurredUtc')
        })

        test('should reject event with invalid actor.kind', async () => {
            const ctx = await fixture.createInvocationContext()
            const event = createValidEvent()
            ;(event as any).actor = { kind: 'invalid-kind', id: 'test-id' }

            await queueProcessWorldEvent(event, ctx as any)

            const errors = ctx.getErrors()
            assert.ok(errors.length > 0, 'Should have validation error')
        })

        test('should reject event with invalid eventId (not UUID)', async () => {
            const ctx = await fixture.createInvocationContext()
            const event = createValidEvent({ eventId: 'not-a-uuid' })

            await queueProcessWorldEvent(event, ctx as any)

            const errors = ctx.getErrors()
            assert.ok(errors.length > 0, 'Should have validation error for invalid UUID')
        })

        test('should handle malformed JSON gracefully', async () => {
            const ctx = await fixture.createInvocationContext()
            const malformedJson = 'not valid json {'

            await queueProcessWorldEvent(malformedJson, ctx as any)

            const errors = ctx.getErrors()
            assert.ok(errors.length > 0, 'Should have JSON parse error')
            const parseError = errors.find((e) => e[0] === 'Failed to parse queue message as JSON')
            assert.ok(parseError, 'Should log JSON parse failure')
        })
    })

    describe('Idempotency', () => {
        beforeEach(() => {
            __resetIdempotencyCacheForTests()
        })

        test('should detect duplicate events with same idempotencyKey', async () => {
            const ctx1 = await fixture.createInvocationContext()
            const ctx2 = await fixture.createInvocationContext()
            const event = createValidEvent({ idempotencyKey: 'unique-duplicate-test-key' })

            await queueProcessWorldEvent(event, ctx1 as any)
            await queueProcessWorldEvent(event, ctx2 as any)

            const logs2 = ctx2.getLogs()
            // Updated to match new log message format (cache or registry detection)
            const duplicateLog = logs2.find(
                (l) =>
                    l[0] === 'Duplicate world event detected (in-memory cache)' ||
                    l[0] === 'Duplicate world event detected (durable registry)'
            )
            assert.ok(duplicateLog, 'Should detect and log duplicate event')
        })

        test('should process events with different idempotencyKeys', async () => {
            const ctx1 = await fixture.createInvocationContext()
            const ctx2 = await fixture.createInvocationContext()

            const event1 = createValidEvent({ idempotencyKey: 'key-1', eventId: '10000000-0000-4000-8000-000000000001' })
            const event2 = createValidEvent({ idempotencyKey: 'key-2', eventId: '20000000-0000-4000-8000-000000000001' })

            await queueProcessWorldEvent(event1, ctx1 as any)
            await queueProcessWorldEvent(event2, ctx2 as any)

            const errors1 = ctx1.getErrors()
            const errors2 = ctx2.getErrors()
            assert.strictEqual(errors1.length, 0, 'First event should process without errors')
            assert.strictEqual(errors2.length, 0, 'Second event should process without errors')

            const logs2 = ctx2.getLogs()
            const successLog2 = logs2.find((l) => l[0] === 'World event processed successfully')
            assert.ok(successLog2, 'Second event with different key should process successfully')
        })
    })

    describe('Edge Cases', () => {
        test('should handle event with empty payload', async () => {
            const ctx = await fixture.createInvocationContext()
            const event = createValidEvent({ payload: {} })

            await queueProcessWorldEvent(event, ctx as any)

            const errors = ctx.getErrors()
            assert.strictEqual(errors.length, 0, 'Empty payload should be valid')
        })

        test('should handle event with version > 1', async () => {
            const ctx = await fixture.createInvocationContext()
            const event = createValidEvent({ version: 2 })

            await queueProcessWorldEvent(event, ctx as any)

            const errors = ctx.getErrors()
            assert.strictEqual(errors.length, 0, 'Higher version should be accepted')
        })

        test('should reject event with version 0', async () => {
            const ctx = await fixture.createInvocationContext()
            const event = createValidEvent({ version: 0 })

            await queueProcessWorldEvent(event, ctx as any)

            const errors = ctx.getErrors()
            assert.ok(errors.length > 0, 'Version 0 should be rejected (must be positive)')
        })

        test('should handle all valid event types', async () => {
            const eventTypes = ['Player.Move', 'Player.Look', 'NPC.Tick', 'World.Ambience.Generated', 'World.Exit.Create', 'Quest.Proposed']

            for (const type of eventTypes) {
                const ctx = await fixture.createInvocationContext()
                const event = createValidEvent({
                    type,
                    idempotencyKey: `test-${type}-${Date.now()}-${Math.random()}`
                })

                await queueProcessWorldEvent(event, ctx as any)

                const errors = ctx.getErrors()
                assert.strictEqual(errors.length, 0, `Event type ${type} should be valid`)
            }
        })
    })

    describe('Dependency Injection', () => {
        test('should use dead-letter repository from DI container', async () => {
            const ctx = await fixture.createInvocationContext()
            const container = ctx.extraInputs.get('container') as Container
            const stored: unknown[] = []

            const fakeRepo: IDeadLetterRepository = {
                async store(record) {
                    stored.push(record)
                },
                async queryByTimeRange() {
                    return []
                },
                async getById() {
                    return null
                }
            }

            container.unbind('IDeadLetterRepository')
            container.bind<IDeadLetterRepository>('IDeadLetterRepository').toConstantValue(fakeRepo)

            await queueProcessWorldEvent('not valid json {', ctx as any)

            assert.strictEqual(stored.length, 1, 'Dead-letter repository from DI should capture stored record')
        })
    })
})
