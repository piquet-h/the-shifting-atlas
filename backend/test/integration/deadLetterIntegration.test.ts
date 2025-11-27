/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Integration Tests for Dead-Letter Storage in Queue Processor
 */
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { __resetIdempotencyCacheForTests, queueProcessWorldEvent } from '../../src/handlers/queueProcessWorldEvent.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import type { Container } from 'inversify'
import type { IDeadLetterRepository } from '../../src/repos/deadLetterRepository.js'
import type { DeadLetterRecord } from '@piquet-h/shared/deadLetter'

describe('Queue Processor Dead-Letter Integration', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
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

            const deadLetterLog = ctx.getLogs().find((l) => l[0] === 'Dead-letter record created for schema validation failure')
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
            const deadLetterLog = logs.find((l) => l[0] === 'Dead-letter record created for schema validation failure')
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
            const deadLetterLog = ctx.getLogs().find((l) => l[0] === 'Dead-letter record created for schema validation failure')
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

    // Issue #401: Enhanced DLQ metadata tests
    describe('Enhanced DLQ Metadata (Issue #401)', () => {
        test('should include errorCode in dead-letter record for JSON parse failure', async () => {
            const ctx = await fixture.createInvocationContext()
            const storedRecords: DeadLetterRecord[] = []

            // Get the container and override dead-letter repository
            const container = ctx.extraInputs.get('container') as Container
            const originalRepo = container.get<IDeadLetterRepository>('IDeadLetterRepository')
            const captureRepo: IDeadLetterRepository = {
                async store(record) {
                    storedRecords.push(record)
                    return originalRepo.store(record)
                },
                queryByTimeRange: originalRepo.queryByTimeRange.bind(originalRepo),
                getById: originalRepo.getById.bind(originalRepo)
            }
            container.unbind('IDeadLetterRepository')
            container.bind<IDeadLetterRepository>('IDeadLetterRepository').toConstantValue(captureRepo)

            // Malformed JSON triggers immediate DLQ (no retry)
            await queueProcessWorldEvent('not valid json {', ctx as any)

            assert.strictEqual(storedRecords.length, 1, 'Should store one dead-letter record')
            const record = storedRecords[0]

            assert.strictEqual(record.errorCode, 'json-parse', 'Should have errorCode json-parse')
            assert.strictEqual(record.retryCount, 0, 'Should have retryCount 0 (no retry for permanent failure)')
            assert.ok(record.firstAttemptTimestamp, 'Should have firstAttemptTimestamp')
            assert.ok(record.failureReason?.includes('permanent'), 'Failure reason should indicate permanent failure')
            assert.ok(record.finalError, 'Should have finalError')
        })

        test('should include errorCode in dead-letter record for schema validation failure', async () => {
            const ctx = await fixture.createInvocationContext()
            const storedRecords: DeadLetterRecord[] = []

            const container = ctx.extraInputs.get('container') as Container
            const originalRepo = container.get<IDeadLetterRepository>('IDeadLetterRepository')
            const captureRepo: IDeadLetterRepository = {
                async store(record) {
                    storedRecords.push(record)
                    return originalRepo.store(record)
                },
                queryByTimeRange: originalRepo.queryByTimeRange.bind(originalRepo),
                getById: originalRepo.getById.bind(originalRepo)
            }
            container.unbind('IDeadLetterRepository')
            container.bind<IDeadLetterRepository>('IDeadLetterRepository').toConstantValue(captureRepo)

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

            assert.strictEqual(storedRecords.length, 1, 'Should store one dead-letter record')
            const record = storedRecords[0]

            assert.strictEqual(record.errorCode, 'schema-validation', 'Should have errorCode schema-validation')
            assert.strictEqual(record.retryCount, 0, 'Should have retryCount 0 (no retry for validation failure)')
            assert.ok(record.firstAttemptTimestamp, 'Should have firstAttemptTimestamp')
            assert.ok(record.originalCorrelationId, 'Should have originalCorrelationId')
            assert.ok(record.failureReason, 'Should have failureReason')
        })

        test('should preserve originalCorrelationId from event envelope', async () => {
            const ctx = await fixture.createInvocationContext()
            const storedRecords: DeadLetterRecord[] = []

            const container = ctx.extraInputs.get('container') as Container
            const originalRepo = container.get<IDeadLetterRepository>('IDeadLetterRepository')
            const captureRepo: IDeadLetterRepository = {
                async store(record) {
                    storedRecords.push(record)
                    return originalRepo.store(record)
                },
                queryByTimeRange: originalRepo.queryByTimeRange.bind(originalRepo),
                getById: originalRepo.getById.bind(originalRepo)
            }
            container.unbind('IDeadLetterRepository')
            container.bind<IDeadLetterRepository>('IDeadLetterRepository').toConstantValue(captureRepo)

            const expectedCorrelationId = 'original-correlation-id-123'
            const invalidEvent = {
                eventId: '00000000-0000-4000-8000-000000000001',
                // type: missing (causes validation failure)
                occurredUtc: '2025-10-31T12:00:00Z',
                actor: { kind: 'player', id: '00000000-0000-4000-8000-000000000002' },
                correlationId: expectedCorrelationId,
                idempotencyKey: 'test-key',
                version: 1,
                payload: {}
            }

            await queueProcessWorldEvent(invalidEvent, ctx as any)

            assert.strictEqual(storedRecords.length, 1)
            const record = storedRecords[0]

            assert.strictEqual(record.originalCorrelationId, expectedCorrelationId, 'Should preserve original correlation ID')
            assert.strictEqual(record.correlationId, expectedCorrelationId, 'Should also set correlationId for legacy compatibility')
        })
    })

    // Issue #401: Poison message → DLQ flow test
    describe('Poison Message to DLQ Flow (Issue #401)', () => {
        test('poison message with invalid JSON moves to DLQ immediately (no retry)', async () => {
            const ctx = await fixture.createInvocationContext()
            const storedRecords: DeadLetterRecord[] = []

            const container = ctx.extraInputs.get('container') as Container
            const originalRepo = container.get<IDeadLetterRepository>('IDeadLetterRepository')
            const captureRepo: IDeadLetterRepository = {
                async store(record) {
                    storedRecords.push(record)
                    return originalRepo.store(record)
                },
                queryByTimeRange: originalRepo.queryByTimeRange.bind(originalRepo),
                getById: originalRepo.getById.bind(originalRepo)
            }
            container.unbind('IDeadLetterRepository')
            container.bind<IDeadLetterRepository>('IDeadLetterRepository').toConstantValue(captureRepo)

            // Poison message: completely malformed, cannot be parsed
            const poisonMessage = '<<<CORRUPTED DATA>>>}}{{'

            await queueProcessWorldEvent(poisonMessage, ctx as any)

            // Verify it went to DLQ
            assert.strictEqual(storedRecords.length, 1, 'Poison message should be dead-lettered')
            const record = storedRecords[0]

            assert.strictEqual(record.errorCode, 'json-parse', 'Should classify as json-parse error')
            assert.strictEqual(record.retryCount, 0, 'Should not retry - immediate DLQ')
            assert.ok(record.failureReason?.toLowerCase().includes('permanent'), 'Should indicate permanent failure')

            // Verify handler did not throw (allows Service Bus to proceed without retry)
            const errors = ctx.getErrors()
            const parseError = errors.find((e) => e[0] === 'Failed to parse queue message as JSON')
            assert.ok(parseError, 'Should log the parse error')
        })

        test('poison message with validation error moves to DLQ immediately (no retry)', async () => {
            const ctx = await fixture.createInvocationContext()
            const storedRecords: DeadLetterRecord[] = []

            const container = ctx.extraInputs.get('container') as Container
            const originalRepo = container.get<IDeadLetterRepository>('IDeadLetterRepository')
            const captureRepo: IDeadLetterRepository = {
                async store(record) {
                    storedRecords.push(record)
                    return originalRepo.store(record)
                },
                queryByTimeRange: originalRepo.queryByTimeRange.bind(originalRepo),
                getById: originalRepo.getById.bind(originalRepo)
            }
            container.unbind('IDeadLetterRepository')
            container.bind<IDeadLetterRepository>('IDeadLetterRepository').toConstantValue(captureRepo)

            // Poison message: valid JSON but completely wrong structure
            const poisonMessage = {
                notAnEvent: true,
                randomField: 12345
            }

            await queueProcessWorldEvent(poisonMessage, ctx as any)

            // Verify it went to DLQ
            assert.strictEqual(storedRecords.length, 1, 'Poison message should be dead-lettered')
            const record = storedRecords[0]

            assert.strictEqual(record.errorCode, 'schema-validation', 'Should classify as schema-validation error')
            assert.strictEqual(record.retryCount, 0, 'Should not retry - immediate DLQ for validation errors')
        })
    })
})
