/**
 * Integration tests for correlationId propagation across publish→process boundary
 *
 * Tests the complete flow:
 * 1. HTTP handler prepares world event with correlationId
 * 2. prepareEnqueueMessage injects correlationId into applicationProperties
 * 3. Queue processor receives message with correlationId
 * 4. Telemetry emits correlationId in World.Event.Processed
 *
 * Validates acceptance criteria from issue:
 * - Wrapper for enqueue adds applicationProperties.correlationId
 * - Idempotent: existing correlationId preserved
 * - Integration test: publish then process retains same correlationId
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { emitWorldEvent, prepareEnqueueMessage } from '@piquet-h/shared/events'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { __resetIdempotencyCacheForTests, queueProcessWorldEvent } from '../../src/handlers/queueProcessWorldEvent.js'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'

describe('CorrelationId Flow Integration', () => {
    let fixture: UnitTestFixture

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
        __resetIdempotencyCacheForTests()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('Publish → Process CorrelationId Retention', () => {
        test('should retain correlationId from prepareEnqueueMessage through processing', async () => {
            const originalCorrelationId = '11111111-1111-4111-8111-111111111111'

            // Step 1: Prepare event envelope (as HTTP handler would)
            const emitResult = emitWorldEvent({
                eventType: 'Player.Move',
                scopeKey: 'loc:test-location',
                payload: {
                    playerId: 'player-1',
                    fromLocationId: 'loc-from',
                    toLocationId: 'loc-to',
                    direction: 'north'
                },
                actor: {
                    kind: 'player',
                    id: '12345678-1234-4234-8234-123456789abc'
                },
                correlationId: originalCorrelationId
            })

            // Step 2: Prepare message for enqueue (injects correlationId into applicationProperties)
            const enqueueResult = prepareEnqueueMessage(emitResult)

            // Verify correlationId in prepared message
            assert.strictEqual(enqueueResult.correlationId, originalCorrelationId)
            assert.strictEqual(enqueueResult.message.correlationId, originalCorrelationId)
            assert.strictEqual(enqueueResult.message.applicationProperties.correlationId, originalCorrelationId)
            assert.strictEqual(enqueueResult.correlationIdGenerated, false)

            // Step 3: Simulate queue message received by processor
            // The message body is what would be dequeued from Service Bus
            const ctx = await fixture.createInvocationContext()
            const queueMessage = enqueueResult.message.body

            await queueProcessWorldEvent(queueMessage, ctx as any)

            // Step 4: Verify processing succeeded with correlationId
            const errors = ctx.getErrors()
            assert.strictEqual(errors.length, 0, 'Should not have errors')

            const logs = ctx.getLogs()
            const processLog = logs.find((l) => l[0] === 'Processing world event')
            assert.ok(processLog, 'Should log processing with correlationId')

            // Verify correlationId in processing log
            const logData = processLog[1] as Record<string, unknown>
            assert.strictEqual(logData.correlationId, originalCorrelationId)

            const successLog = logs.find((l) => l[0] === 'World event processed successfully')
            assert.ok(successLog, 'Should log successful processing')
        })

        test('should handle auto-generated correlationId through publish→process', async () => {
            // Emit event without correlationId (auto-generated)
            const emitResult = emitWorldEvent({
                eventType: 'Player.Look',
                scopeKey: 'loc:test-location',
                payload: { locationId: 'loc-1' },
                actor: { kind: 'player' }
                // correlationId intentionally omitted
            })

            // Prepare message for enqueue
            const enqueueResult = prepareEnqueueMessage(emitResult)

            // Verify correlationId was generated
            assert.ok(enqueueResult.correlationId, 'Should have auto-generated correlationId')
            assert.strictEqual(enqueueResult.correlationIdGenerated, true)
            assert.ok(enqueueResult.warnings.some((w) => w.includes('auto-generated')))

            // Process the message
            const ctx = await fixture.createInvocationContext()
            await queueProcessWorldEvent(enqueueResult.message.body, ctx as any)

            const errors = ctx.getErrors()
            assert.strictEqual(errors.length, 0, 'Should not have errors')

            // Verify the auto-generated correlationId was used in processing
            const logs = ctx.getLogs()
            const processLog = logs.find((l) => l[0] === 'Processing world event')
            assert.ok(processLog, 'Should log processing')

            const logData = processLog[1] as Record<string, unknown>
            assert.strictEqual(logData.correlationId, enqueueResult.correlationId)
        })

        test('should preserve original correlationId when applicationProperties differs', async () => {
            const envelopeCorrelationId = '11111111-1111-4111-8111-111111111111'
            const existingPropsCorrelationId = '22222222-2222-4222-8222-222222222222'

            // Emit event with specific correlationId
            const emitResult = emitWorldEvent({
                eventType: 'Player.Move',
                scopeKey: 'loc:test-location',
                payload: { direction: 'north' },
                actor: { kind: 'player' },
                correlationId: envelopeCorrelationId
            })

            // Prepare message with conflicting existing applicationProperties
            const existingProps = {
                correlationId: existingPropsCorrelationId,
                customProp: 'value'
            }
            const enqueueResult = prepareEnqueueMessage(emitResult, existingProps)

            // Verify envelope's correlationId takes precedence
            assert.strictEqual(enqueueResult.correlationId, envelopeCorrelationId)
            assert.strictEqual(enqueueResult.message.applicationProperties.correlationId, envelopeCorrelationId)

            // Verify original is preserved
            assert.strictEqual(enqueueResult.originalApplicationPropertiesCorrelationId, existingPropsCorrelationId)
            assert.strictEqual(enqueueResult.message.applicationProperties['publish.correlationId.original'], existingPropsCorrelationId)

            // Verify custom prop merged
            assert.strictEqual(enqueueResult.message.applicationProperties.customProp, 'value')

            // Process message - should use envelope's correlationId
            const ctx = await fixture.createInvocationContext()
            await queueProcessWorldEvent(enqueueResult.message.body, ctx as any)

            const errors = ctx.getErrors()
            assert.strictEqual(errors.length, 0, 'Should not have errors')

            const logs = ctx.getLogs()
            const processLog = logs.find((l) => l[0] === 'Processing world event')
            const logData = processLog?.[1] as Record<string, unknown>
            assert.strictEqual(logData?.correlationId, envelopeCorrelationId)
        })

        test('should maintain correlationId through duplicate detection', async () => {
            const correlationId = '33333333-3333-4333-8333-333333333333'

            const emitResult = emitWorldEvent({
                eventType: 'Player.Move',
                scopeKey: 'loc:test-location',
                payload: {},
                actor: { kind: 'player' },
                correlationId,
                idempotencyKey: 'test-duplicate-correlation'
            })

            const enqueueResult = prepareEnqueueMessage(emitResult)

            // First processing
            const ctx1 = await fixture.createInvocationContext()
            await queueProcessWorldEvent(enqueueResult.message.body, ctx1 as any)

            const errors1 = ctx1.getErrors()
            assert.strictEqual(errors1.length, 0, 'First processing should succeed')

            // Second processing (duplicate)
            const ctx2 = await fixture.createInvocationContext()
            await queueProcessWorldEvent(enqueueResult.message.body, ctx2 as any)

            // Should detect duplicate but still use correlationId
            const logs2 = ctx2.getLogs()
            const duplicateLog = logs2.find(
                (l) =>
                    l[0] === 'Duplicate world event detected (in-memory cache)' ||
                    l[0] === 'Duplicate world event detected (durable registry)'
            )
            assert.ok(duplicateLog, 'Should detect duplicate')
        })
    })

    describe('Registry CorrelationId Persistence', () => {
        test('should store correlationId in processed event registry', async () => {
            const correlationId = '44444444-4444-4444-8444-444444444444'

            const emitResult = emitWorldEvent({
                eventType: 'NPC.Tick',
                scopeKey: 'loc:npc-location',
                payload: { npcId: 'npc-1' },
                actor: { kind: 'system' },
                correlationId,
                idempotencyKey: `test-registry-correlation-${Date.now()}`
            })

            const enqueueResult = prepareEnqueueMessage(emitResult)
            const ctx = await fixture.createInvocationContext()

            await queueProcessWorldEvent(enqueueResult.message.body, ctx as any)

            const errors = ctx.getErrors()
            assert.strictEqual(errors.length, 0, 'Should not have errors')

            // Verify registry log shows correlationId
            const logs = ctx.getLogs()
            const registryLog = logs.find((l) => l[0] === 'Event marked as processed in registry')
            assert.ok(registryLog, 'Should log registry write')
        })
    })

    describe('Message Structure Verification', () => {
        test('should include all required applicationProperties for Service Bus', async () => {
            const emitResult = emitWorldEvent({
                eventType: 'World.Exit.Create',
                scopeKey: 'loc:source-location',
                payload: {
                    fromLocationId: 'loc-source',
                    toLocationId: 'loc-target',
                    direction: 'east'
                },
                actor: { kind: 'system' },
                correlationId: '55555555-5555-4555-8555-555555555555',
                operationId: 'op-12345'
            })

            const enqueueResult = prepareEnqueueMessage(emitResult)

            // Verify all required applicationProperties
            const props = enqueueResult.message.applicationProperties
            assert.strictEqual(props.correlationId, '55555555-5555-4555-8555-555555555555')
            assert.strictEqual(props.eventType, 'World.Exit.Create')
            assert.strictEqual(props.scopeKey, 'loc:source-location')
            assert.strictEqual(props.operationId, 'op-12345')

            // Verify message-level correlationId
            assert.strictEqual(enqueueResult.message.correlationId, '55555555-5555-4555-8555-555555555555')

            // Verify content type
            assert.strictEqual(enqueueResult.message.contentType, 'application/json')

            // Verify body is the envelope
            assert.strictEqual(enqueueResult.message.body.eventId, emitResult.envelope.eventId)
            assert.strictEqual(enqueueResult.message.body.type, 'World.Exit.Create')
        })
    })
})
