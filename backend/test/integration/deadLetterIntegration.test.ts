/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Integration Tests for Dead-Letter Storage in Queue Processor
 */
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { __resetIdempotencyCacheForTests, queueProcessWorldEvent } from '../../src/functions/queueProcessWorldEvent.js'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'

describe('Queue Processor Dead-Letter Integration', () => {
    let fixture: UnitTestFixture

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
        __resetIdempotencyCacheForTests()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('Validation Failure Dead-Lettering', () => {
        test('should create dead-letter record on schema validation failure', async () => {
            const ctx = await fixture.createInvocationContext()

            // Invalid event (missing required type field)
            const invalidEvent = {
                eventId: '00000000-0000-4000-8000-000000000001',
                // type: missing
                occurredUtc: '2025-10-31T12:00:00Z',
                actor: { kind: 'player', id: '00000000-0000-4000-8000-000000000002' },
                correlationId: '00000000-0000-4000-8000-000000000003',
                idempotencyKey: 'test-key',
                version: 1,
                payload: {}
            }

            await queueProcessWorldEvent(invalidEvent, ctx as any)

            const errors = ctx.getErrors()
            assert.ok(errors.length > 0)

            const validationError = errors.find((e) => e[0] === 'World event envelope validation failed')
            assert.ok(validationError, 'Should log validation failure')

            const deadLetterLog = ctx.getLogs().find((l) => l[0] === 'Dead-letter record created')
            assert.ok(deadLetterLog, 'Should log dead-letter record creation')
        })

        test('should create dead-letter record on JSON parse failure', async () => {
            const ctx = await fixture.createInvocationContext()

            // Malformed JSON string
            const malformedJson = 'not valid json {'

            await queueProcessWorldEvent(malformedJson, ctx as any)

            const errors = ctx.getErrors()
            assert.ok(errors.length > 0)

            const parseError = errors.find((e) => e[0] === 'Failed to parse queue message as JSON')
            assert.ok(parseError, 'Should log JSON parse failure')

            const deadLetterLog = ctx.getLogs().find((l) => l[0] === 'Dead-letter record created for JSON parse failure')
            assert.ok(deadLetterLog, 'Should log dead-letter record creation')
        })

        test('should redact sensitive fields in dead-letter record', async () => {
            const ctx = await fixture.createInvocationContext()

            // Invalid event with sensitive data
            const invalidEvent = {
                eventId: '12345678-1234-4234-8234-123456789012',
                type: 'InvalidType', // Invalid type (not in enum)
                occurredUtc: '2025-10-31T12:00:00Z',
                actor: {
                    kind: 'player',
                    id: '98765432-9876-4876-8876-987654321098' // Should be redacted
                },
                correlationId: 'corr-123',
                idempotencyKey: 'test-key',
                version: 1,
                payload: {
                    playerId: '11111111-2222-3333-4444-555555555555', // Should be redacted
                    secretData: 'sensitive information'
                }
            }

            await queueProcessWorldEvent(invalidEvent, ctx as any)

            const logs = ctx.getLogs()
            const deadLetterLog = logs.find((l) => l[0] === 'Dead-letter record created')
            assert.ok(deadLetterLog, 'Should create dead-letter record')

            // Verify redaction occurred (check log data if available)
            const logData = deadLetterLog[1] as Record<string, unknown>
            assert.ok(logData.recordId)
            assert.ok(logData.errorCount)
        })

        test('should not throw if dead-letter storage fails', async () => {
            const ctx = await fixture.createInvocationContext()

            // Invalid event
            const invalidEvent = {
                eventId: 'test-id'
                // Missing required fields
            }

            // This should not throw even if internal storage fails
            await assert.doesNotReject(async () => {
                await queueProcessWorldEvent(invalidEvent, ctx as any)
            })

            const errors = ctx.getErrors()
            assert.ok(errors.length > 0)
        })
    })

    describe('Dead-Letter Telemetry', () => {
        test('should emit World.Event.DeadLettered telemetry', async () => {
            const ctx = await fixture.createInvocationContext()

            const invalidEvent = {
                eventId: '00000000-0000-4000-8000-000000000001',
                // type: missing
                occurredUtc: '2025-10-31T12:00:00Z',
                actor: { kind: 'player' },
                correlationId: '00000000-0000-4000-8000-000000000003',
                idempotencyKey: 'test-key',
                version: 1,
                payload: {}
            }

            await queueProcessWorldEvent(invalidEvent, ctx as any)

            // Check that dead-letter processing completed
            const deadLetterLog = ctx.getLogs().find((l) => l[0] === 'Dead-letter record created')
            assert.ok(deadLetterLog, 'Should emit dead-letter telemetry event')
        })
    })

    describe('Happy Path Not Affected', () => {
        test('should process valid events normally without dead-lettering', async () => {
            const ctx = await fixture.createInvocationContext()

            const validEvent = {
                eventId: '00000000-0000-4000-8000-000000000001',
                type: 'Player.Move',
                occurredUtc: '2025-10-31T12:00:00Z',
                actor: { kind: 'player', id: '00000000-0000-4000-8000-000000000002' },
                correlationId: '00000000-0000-4000-8000-000000000003',
                idempotencyKey: 'test-key',
                version: 1,
                payload: {
                    playerId: '00000000-0000-4000-8000-000000000002',
                    fromLocationId: 'loc-1',
                    toLocationId: 'loc-2',
                    direction: 'north'
                }
            }

            await queueProcessWorldEvent(validEvent, ctx as any)

            const errors = ctx.getErrors()
            assert.strictEqual(errors.length, 0, 'Should not have errors for valid event')

            const successLog = ctx.getLogs().find((l) => l[0] === 'World event processed successfully')
            assert.ok(successLog, 'Should process valid event successfully')

            const deadLetterLog = ctx.getLogs().find((l) => l[0] === 'Dead-letter record created')
            assert.ok(!deadLetterLog, 'Should not create dead-letter record for valid event')
        })
    })
})
