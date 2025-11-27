/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for World Event Emitter helper
 *
 * Tests cover:
 * - Valid event emission
 * - Correlation ID auto-generation with warning
 * - Event type validation (invalid type throws)
 * - Actor validation
 * - Schema validation
 * - Service Bus message properties
 * - Error type guards
 * - Enqueue wrapper correlationId injection
 * - Batch enqueue correlation strategies
 */
import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import {
    ActorKindSchema,
    emitWorldEvent,
    isRetryableError,
    isValidationError,
    prepareBatchEnqueueMessages,
    prepareEnqueueMessage,
    ServiceBusUnavailableError,
    WorldEventTypeSchema,
    WorldEventValidationError,
    type EmitWorldEventOptions
} from '../src/events/index.js'

describe('World Event Emitter', () => {
    describe('emitWorldEvent', () => {
        it('should emit valid event with all fields provided', () => {
            const options: EmitWorldEventOptions = {
                eventType: 'Player.Move',
                scopeKey: 'loc:12345678-1234-4234-8234-123456789abc',
                payload: {
                    playerId: 'player-1',
                    fromLocationId: 'loc-1',
                    toLocationId: 'loc-2',
                    direction: 'north'
                },
                actor: {
                    kind: 'player',
                    id: '12345678-1234-4234-8234-123456789abc'
                },
                correlationId: '11111111-1111-4111-8111-111111111111',
                operationId: 'op-12345'
            }

            const result = emitWorldEvent(options)

            assert.ok(result.envelope, 'Should return envelope')
            assert.ok(result.envelope.eventId, 'Should have eventId')
            assert.strictEqual(result.envelope.type, 'Player.Move')
            assert.strictEqual(result.envelope.correlationId, '11111111-1111-4111-8111-111111111111')
            assert.strictEqual(result.envelope.version, 1)
            assert.deepStrictEqual(result.envelope.actor, { kind: 'player', id: '12345678-1234-4234-8234-123456789abc' })
            assert.ok(result.envelope.occurredUtc, 'Should have occurredUtc')
            assert.ok(result.envelope.idempotencyKey, 'Should have idempotencyKey')

            // Check message properties
            assert.strictEqual(result.messageProperties.correlationId, '11111111-1111-4111-8111-111111111111')
            assert.strictEqual(result.messageProperties.operationId, 'op-12345')
            assert.strictEqual(result.messageProperties.eventType, 'Player.Move')
            assert.strictEqual(result.messageProperties.scopeKey, 'loc:12345678-1234-4234-8234-123456789abc')

            // No warnings when correlationId provided
            assert.strictEqual(result.warnings.length, 0)
        })

        it('should auto-generate correlationId when not provided with warning', () => {
            const options: EmitWorldEventOptions = {
                eventType: 'Player.Look',
                scopeKey: 'player:12345678-1234-4234-8234-123456789abc',
                payload: { locationId: 'loc-1' },
                actor: { kind: 'player' }
                // correlationId intentionally omitted
            }

            const result = emitWorldEvent(options)

            // Should have a generated correlationId
            assert.ok(result.envelope.correlationId, 'Should have auto-generated correlationId')
            assert.match(result.envelope.correlationId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)

            // Should have warning about auto-generation
            assert.strictEqual(result.warnings.length, 1)
            assert.ok(result.warnings[0].includes('correlationId not provided'))
            assert.ok(result.warnings[0].includes('auto-generated'))
        })

        it('should throw WorldEventValidationError for invalid eventType', () => {
            const options: EmitWorldEventOptions = {
                eventType: 'Invalid.Event.Type' as any,
                scopeKey: 'loc:12345678-1234-4234-8234-123456789abc',
                payload: {},
                actor: { kind: 'player' },
                correlationId: '11111111-1111-4111-8111-111111111111'
            }

            assert.throws(
                () => emitWorldEvent(options),
                (error: any) => {
                    assert.ok(error instanceof WorldEventValidationError)
                    assert.ok(error.message.includes('Invalid event type'))
                    assert.ok(error.issues.length > 0)
                    assert.strictEqual(error.issues[0].path, 'eventType')
                    return true
                }
            )
        })

        it('should throw WorldEventValidationError for invalid actor kind', () => {
            const options: EmitWorldEventOptions = {
                eventType: 'Player.Move',
                scopeKey: 'loc:12345678-1234-4234-8234-123456789abc',
                payload: {},
                actor: { kind: 'invalid-kind' as any },
                correlationId: '11111111-1111-4111-8111-111111111111'
            }

            assert.throws(
                () => emitWorldEvent(options),
                (error: any) => {
                    assert.ok(error instanceof WorldEventValidationError)
                    assert.ok(error.message.includes('Invalid actor kind'))
                    return true
                }
            )
        })

        it('should throw WorldEventValidationError for invalid actor ID format', () => {
            const options: EmitWorldEventOptions = {
                eventType: 'Player.Move',
                scopeKey: 'loc:12345678-1234-4234-8234-123456789abc',
                payload: {},
                actor: { kind: 'player', id: 'not-a-uuid' },
                correlationId: '11111111-1111-4111-8111-111111111111'
            }

            assert.throws(
                () => emitWorldEvent(options),
                (error: any) => {
                    assert.ok(error instanceof WorldEventValidationError)
                    assert.ok(error.message.includes('Invalid actor ID'))
                    return true
                }
            )
        })

        it('should throw WorldEventValidationError for invalid correlationId format', () => {
            const options: EmitWorldEventOptions = {
                eventType: 'Player.Move',
                scopeKey: 'loc:12345678-1234-4234-8234-123456789abc',
                payload: {},
                actor: { kind: 'player' },
                correlationId: 'not-a-valid-uuid'
            }

            assert.throws(
                () => emitWorldEvent(options),
                (error: any) => {
                    assert.ok(error instanceof WorldEventValidationError)
                    assert.ok(error.message.includes('Invalid correlationId'))
                    return true
                }
            )
        })

        it('should throw WorldEventValidationError for invalid causationId format', () => {
            const options: EmitWorldEventOptions = {
                eventType: 'Player.Move',
                scopeKey: 'loc:12345678-1234-4234-8234-123456789abc',
                payload: {},
                actor: { kind: 'player' },
                correlationId: '11111111-1111-4111-8111-111111111111',
                causationId: 'invalid-causation-id'
            }

            assert.throws(
                () => emitWorldEvent(options),
                (error: any) => {
                    assert.ok(error instanceof WorldEventValidationError)
                    assert.ok(error.message.includes('Invalid causationId'))
                    return true
                }
            )
        })

        it('should include causationId when provided', () => {
            const options: EmitWorldEventOptions = {
                eventType: 'NPC.Tick',
                scopeKey: 'loc:12345678-1234-4234-8234-123456789abc',
                payload: { npcId: 'npc-1' },
                actor: { kind: 'system' },
                correlationId: '11111111-1111-4111-8111-111111111111',
                causationId: '22222222-2222-4222-8222-222222222222'
            }

            const result = emitWorldEvent(options)

            assert.strictEqual(result.envelope.causationId, '22222222-2222-4222-8222-222222222222')
        })

        it('should use provided idempotencyKey', () => {
            const options: EmitWorldEventOptions = {
                eventType: 'World.Exit.Create',
                scopeKey: 'loc:12345678-1234-4234-8234-123456789abc',
                payload: { fromLocationId: 'loc-1', toLocationId: 'loc-2', direction: 'north' },
                actor: { kind: 'system' },
                correlationId: '11111111-1111-4111-8111-111111111111',
                idempotencyKey: 'custom:idempotency:key'
            }

            const result = emitWorldEvent(options)

            assert.strictEqual(result.envelope.idempotencyKey, 'custom:idempotency:key')
        })

        it('should generate idempotencyKey when not provided', () => {
            const options: EmitWorldEventOptions = {
                eventType: 'Player.Move',
                scopeKey: 'loc:test-location',
                payload: {},
                actor: { kind: 'player' },
                correlationId: '11111111-1111-4111-8111-111111111111'
            }

            const result = emitWorldEvent(options)

            assert.ok(result.envelope.idempotencyKey, 'Should have generated idempotencyKey')
            assert.ok(result.envelope.idempotencyKey.includes('player'), 'Should include actor kind')
            assert.ok(result.envelope.idempotencyKey.includes('Player.Move'), 'Should include event type')
        })

        it('should use provided occurredUtc', () => {
            const customTimestamp = '2025-01-15T10:30:00.000Z'
            const options: EmitWorldEventOptions = {
                eventType: 'Player.Move',
                scopeKey: 'loc:12345678-1234-1234-1234-123456789abc',
                payload: {},
                actor: { kind: 'player' },
                correlationId: '11111111-1111-4111-8111-111111111111',
                occurredUtc: customTimestamp
            }

            const result = emitWorldEvent(options)

            assert.strictEqual(result.envelope.occurredUtc, customTimestamp)
        })

        it('should handle all valid event types', () => {
            // Use schema options to stay synchronized with the schema definition
            const eventTypes = WorldEventTypeSchema.options

            for (const eventType of eventTypes) {
                const options: EmitWorldEventOptions = {
                    eventType: eventType,
                    scopeKey: 'loc:12345678-1234-4234-8234-123456789abc',
                    payload: {},
                    actor: { kind: 'system' },
                    correlationId: '11111111-1111-4111-8111-111111111111'
                }

                const result = emitWorldEvent(options)
                assert.strictEqual(result.envelope.type, eventType, `Should accept event type: ${eventType}`)
            }
        })

        it('should handle all valid actor kinds', () => {
            // Use schema options to stay synchronized with the schema definition
            const actorKinds = ActorKindSchema.options

            for (const kind of actorKinds) {
                const options: EmitWorldEventOptions = {
                    eventType: 'Player.Move',
                    scopeKey: 'loc:12345678-1234-4234-8234-123456789abc',
                    payload: {},
                    actor: { kind: kind },
                    correlationId: '11111111-1111-4111-8111-111111111111'
                }

                const result = emitWorldEvent(options)
                assert.strictEqual(result.envelope.actor.kind, kind, `Should accept actor kind: ${kind}`)
            }
        })

        it('should accept actor without id', () => {
            const options: EmitWorldEventOptions = {
                eventType: 'NPC.Tick',
                scopeKey: 'global:system',
                payload: {},
                actor: { kind: 'system' }, // No id for system actor
                correlationId: '11111111-1111-4111-8111-111111111111'
            }

            const result = emitWorldEvent(options)

            assert.strictEqual(result.envelope.actor.kind, 'system')
            assert.strictEqual(result.envelope.actor.id, undefined)
        })

        it('should not include operationId in properties when not provided', () => {
            const options: EmitWorldEventOptions = {
                eventType: 'Player.Move',
                scopeKey: 'loc:12345678-1234-4234-8234-123456789abc',
                payload: {},
                actor: { kind: 'player' },
                correlationId: '11111111-1111-4111-8111-111111111111'
                // operationId intentionally omitted
            }

            const result = emitWorldEvent(options)

            assert.strictEqual(result.messageProperties.operationId, undefined)
        })
    })

    describe('Error Type Guards', () => {
        it('isValidationError should return true for WorldEventValidationError', () => {
            const error = new WorldEventValidationError('Test error', [])
            assert.strictEqual(isValidationError(error), true)
        })

        it('isValidationError should return false for other errors', () => {
            assert.strictEqual(isValidationError(new Error('Generic error')), false)
            assert.strictEqual(isValidationError(null), false)
            assert.strictEqual(isValidationError(undefined), false)
            assert.strictEqual(isValidationError('string'), false)
        })

        it('isRetryableError should return true for ServiceBusUnavailableError', () => {
            const error = new ServiceBusUnavailableError('Service Bus unavailable')
            assert.strictEqual(isRetryableError(error), true)
        })

        it('isRetryableError should return false for other errors', () => {
            assert.strictEqual(isRetryableError(new Error('Generic error')), false)
            assert.strictEqual(isRetryableError(new WorldEventValidationError('Test', [])), false)
            assert.strictEqual(isRetryableError(null), false)
        })

        it('ServiceBusUnavailableError should have retryable flag and code', () => {
            const cause = new Error('Connection refused')
            const error = new ServiceBusUnavailableError('Service Bus unavailable', cause)

            assert.strictEqual(error.retryable, true)
            assert.strictEqual(error.code, 'SERVICEBUS_UNAVAILABLE')
            assert.strictEqual(error.cause, cause)
            assert.strictEqual(error.name, 'ServiceBusUnavailableError')
        })

        it('WorldEventValidationError should not be retryable', () => {
            const error = new WorldEventValidationError('Invalid event', [{ path: 'type', message: 'Invalid', code: 'invalid' }])

            assert.strictEqual(error.retryable, false)
            assert.strictEqual(error.name, 'WorldEventValidationError')
            assert.strictEqual(error.issues.length, 1)
        })
    })

    describe('Edge Cases', () => {
        it('should handle empty payload', () => {
            const options: EmitWorldEventOptions = {
                eventType: 'Player.Look',
                scopeKey: 'loc:12345678-1234-4234-8234-123456789abc',
                payload: {},
                actor: { kind: 'player' },
                correlationId: '11111111-1111-4111-8111-111111111111'
            }

            const result = emitWorldEvent(options)

            assert.deepStrictEqual(result.envelope.payload, {})
        })

        it('should handle complex payload', () => {
            const complexPayload = {
                playerId: 'player-1',
                nested: {
                    deep: {
                        value: 'test'
                    }
                },
                array: [1, 2, 3],
                boolean: true,
                number: 42.5
            }

            const options: EmitWorldEventOptions = {
                eventType: 'Player.Move',
                scopeKey: 'loc:12345678-1234-4234-8234-123456789abc',
                payload: complexPayload,
                actor: { kind: 'player' },
                correlationId: '11111111-1111-4111-8111-111111111111'
            }

            const result = emitWorldEvent(options)

            assert.deepStrictEqual(result.envelope.payload, complexPayload)
        })
    })

    describe('prepareEnqueueMessage', () => {
        it('should prepare message with correlationId from envelope', () => {
            const options: EmitWorldEventOptions = {
                eventType: 'Player.Move',
                scopeKey: 'loc:12345678-1234-4234-8234-123456789abc',
                payload: { playerId: 'player-1' },
                actor: { kind: 'player', id: '12345678-1234-4234-8234-123456789abc' },
                correlationId: '11111111-1111-4111-8111-111111111111'
            }

            const emitResult = emitWorldEvent(options)
            const enqueueResult = prepareEnqueueMessage(emitResult)

            assert.strictEqual(enqueueResult.correlationId, '11111111-1111-4111-8111-111111111111')
            assert.strictEqual(enqueueResult.message.correlationId, '11111111-1111-4111-8111-111111111111')
            assert.strictEqual(enqueueResult.message.applicationProperties.correlationId, '11111111-1111-4111-8111-111111111111')
            assert.strictEqual(enqueueResult.correlationIdGenerated, false)
            assert.strictEqual(enqueueResult.message.contentType, 'application/json')
        })

        it('should generate correlationId when not provided', () => {
            const options: EmitWorldEventOptions = {
                eventType: 'Player.Look',
                scopeKey: 'loc:12345678-1234-4234-8234-123456789abc',
                payload: {},
                actor: { kind: 'player' }
                // correlationId intentionally omitted
            }

            const emitResult = emitWorldEvent(options)
            const enqueueResult = prepareEnqueueMessage(emitResult)

            assert.ok(enqueueResult.correlationId, 'Should have correlationId')
            assert.match(enqueueResult.correlationId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
            assert.strictEqual(enqueueResult.correlationIdGenerated, true)
            assert.ok(enqueueResult.warnings.some((w) => w.includes('auto-generated')))
        })

        it('should preserve existing correlationId on second enqueue (idempotent)', () => {
            const options: EmitWorldEventOptions = {
                eventType: 'Player.Move',
                scopeKey: 'loc:12345678-1234-4234-8234-123456789abc',
                payload: {},
                actor: { kind: 'player' },
                correlationId: '11111111-1111-4111-8111-111111111111'
            }

            const emitResult = emitWorldEvent(options)

            // First enqueue
            const firstEnqueue = prepareEnqueueMessage(emitResult)
            // Second enqueue (simulates retry or re-emission)
            const secondEnqueue = prepareEnqueueMessage(emitResult)

            assert.strictEqual(firstEnqueue.correlationId, secondEnqueue.correlationId)
            assert.strictEqual(secondEnqueue.correlationId, '11111111-1111-4111-8111-111111111111')
        })

        it('should preserve original correlationId from applicationProperties when different', () => {
            const options: EmitWorldEventOptions = {
                eventType: 'Player.Move',
                scopeKey: 'loc:12345678-1234-4234-8234-123456789abc',
                payload: {},
                actor: { kind: 'player' },
                correlationId: '11111111-1111-4111-8111-111111111111'
            }

            const emitResult = emitWorldEvent(options)

            // Simulate existing applicationProperties with different correlationId
            const existingProps = {
                correlationId: '22222222-2222-4222-8222-222222222222',
                customProperty: 'value'
            }

            const enqueueResult = prepareEnqueueMessage(emitResult, existingProps)

            // Should use envelope's correlationId
            assert.strictEqual(enqueueResult.correlationId, '11111111-1111-4111-8111-111111111111')
            assert.strictEqual(enqueueResult.message.applicationProperties.correlationId, '11111111-1111-4111-8111-111111111111')

            // Should preserve original in special attribute
            assert.strictEqual(
                enqueueResult.message.applicationProperties['publish.correlationId.original'],
                '22222222-2222-4222-8222-222222222222'
            )
            assert.strictEqual(enqueueResult.originalApplicationPropertiesCorrelationId, '22222222-2222-4222-8222-222222222222')

            // Should merge other properties
            assert.strictEqual(enqueueResult.message.applicationProperties.customProperty, 'value')

            // Should have warning about different correlationId
            assert.ok(enqueueResult.warnings.some((w) => w.includes('different correlationId')))
        })

        it('should not add original attribute when correlationIds match', () => {
            const options: EmitWorldEventOptions = {
                eventType: 'Player.Move',
                scopeKey: 'loc:12345678-1234-4234-8234-123456789abc',
                payload: {},
                actor: { kind: 'player' },
                correlationId: '11111111-1111-4111-8111-111111111111'
            }

            const emitResult = emitWorldEvent(options)

            // Existing properties with same correlationId
            const existingProps = {
                correlationId: '11111111-1111-4111-8111-111111111111'
            }

            const enqueueResult = prepareEnqueueMessage(emitResult, existingProps)

            assert.strictEqual(enqueueResult.message.applicationProperties['publish.correlationId.original'], undefined)
            assert.strictEqual(enqueueResult.originalApplicationPropertiesCorrelationId, undefined)
        })

        it('should include eventType and scopeKey in applicationProperties', () => {
            const options: EmitWorldEventOptions = {
                eventType: 'World.Exit.Create',
                scopeKey: 'loc:test-location-id',
                payload: {},
                actor: { kind: 'system' },
                correlationId: '11111111-1111-4111-8111-111111111111'
            }

            const emitResult = emitWorldEvent(options)
            const enqueueResult = prepareEnqueueMessage(emitResult)

            assert.strictEqual(enqueueResult.message.applicationProperties.eventType, 'World.Exit.Create')
            assert.strictEqual(enqueueResult.message.applicationProperties.scopeKey, 'loc:test-location-id')
        })

        it('should include operationId when present', () => {
            const options: EmitWorldEventOptions = {
                eventType: 'Player.Move',
                scopeKey: 'loc:test',
                payload: {},
                actor: { kind: 'player' },
                correlationId: '11111111-1111-4111-8111-111111111111',
                operationId: 'op-12345'
            }

            const emitResult = emitWorldEvent(options)
            const enqueueResult = prepareEnqueueMessage(emitResult)

            assert.strictEqual(enqueueResult.message.applicationProperties.operationId, 'op-12345')
        })

        it('should include envelope in message body', () => {
            const options: EmitWorldEventOptions = {
                eventType: 'Player.Move',
                scopeKey: 'loc:test',
                payload: { key: 'value' },
                actor: { kind: 'player' },
                correlationId: '11111111-1111-4111-8111-111111111111'
            }

            const emitResult = emitWorldEvent(options)
            const enqueueResult = prepareEnqueueMessage(emitResult)

            assert.deepStrictEqual(enqueueResult.message.body, emitResult.envelope)
        })
    })

    describe('prepareBatchEnqueueMessages', () => {
        it('should prepare multiple messages with individual correlationIds', () => {
            const options1: EmitWorldEventOptions = {
                eventType: 'Player.Move',
                scopeKey: 'loc:loc1',
                payload: {},
                actor: { kind: 'player' },
                correlationId: '11111111-1111-4111-8111-111111111111'
            }

            const options2: EmitWorldEventOptions = {
                eventType: 'Player.Look',
                scopeKey: 'loc:loc2',
                payload: {},
                actor: { kind: 'player' },
                correlationId: '22222222-2222-4222-8222-222222222222'
            }

            const emitResults = [emitWorldEvent(options1), emitWorldEvent(options2)]
            const batchResults = prepareBatchEnqueueMessages(emitResults, { correlationMode: 'individual' })

            assert.strictEqual(batchResults.length, 2)
            assert.strictEqual(batchResults[0].correlationId, '11111111-1111-4111-8111-111111111111')
            assert.strictEqual(batchResults[1].correlationId, '22222222-2222-4222-8222-222222222222')
        })

        it('should use shared correlationId when mode is shared', () => {
            const options1: EmitWorldEventOptions = {
                eventType: 'Player.Move',
                scopeKey: 'loc:loc1',
                payload: {},
                actor: { kind: 'player' },
                correlationId: '11111111-1111-4111-8111-111111111111'
            }

            const options2: EmitWorldEventOptions = {
                eventType: 'Player.Look',
                scopeKey: 'loc:loc2',
                payload: {},
                actor: { kind: 'player' },
                correlationId: '22222222-2222-4222-8222-222222222222'
            }

            const emitResults = [emitWorldEvent(options1), emitWorldEvent(options2)]
            const batchResults = prepareBatchEnqueueMessages(emitResults, {
                correlationMode: 'shared',
                batchCorrelationId: '33333333-3333-4333-8333-333333333333'
            })

            assert.strictEqual(batchResults.length, 2)
            assert.strictEqual(batchResults[0].correlationId, '33333333-3333-4333-8333-333333333333')
            assert.strictEqual(batchResults[1].correlationId, '33333333-3333-4333-8333-333333333333')
        })

        it('should generate shared correlationId when not provided in shared mode', () => {
            const options1: EmitWorldEventOptions = {
                eventType: 'Player.Move',
                scopeKey: 'loc:loc1',
                payload: {},
                actor: { kind: 'player' },
                correlationId: '11111111-1111-4111-8111-111111111111'
            }

            const options2: EmitWorldEventOptions = {
                eventType: 'Player.Look',
                scopeKey: 'loc:loc2',
                payload: {},
                actor: { kind: 'player' },
                correlationId: '22222222-2222-4222-8222-222222222222'
            }

            const emitResults = [emitWorldEvent(options1), emitWorldEvent(options2)]
            const batchResults = prepareBatchEnqueueMessages(emitResults, { correlationMode: 'shared' })

            assert.strictEqual(batchResults.length, 2)
            // Both should have the same generated correlationId
            assert.strictEqual(batchResults[0].correlationId, batchResults[1].correlationId)
            // Should have warning about generated correlationId
            assert.ok(batchResults[0].warnings.some((w) => w.includes('Batch mode')))
        })

        it('should default to individual mode', () => {
            const options1: EmitWorldEventOptions = {
                eventType: 'Player.Move',
                scopeKey: 'loc:loc1',
                payload: {},
                actor: { kind: 'player' },
                correlationId: '11111111-1111-4111-8111-111111111111'
            }

            const options2: EmitWorldEventOptions = {
                eventType: 'Player.Look',
                scopeKey: 'loc:loc2',
                payload: {},
                actor: { kind: 'player' },
                correlationId: '22222222-2222-4222-8222-222222222222'
            }

            const emitResults = [emitWorldEvent(options1), emitWorldEvent(options2)]
            // No options means default mode
            const batchResults = prepareBatchEnqueueMessages(emitResults)

            assert.strictEqual(batchResults[0].correlationId, '11111111-1111-4111-8111-111111111111')
            assert.strictEqual(batchResults[1].correlationId, '22222222-2222-4222-8222-222222222222')
        })

        it('should handle empty batch', () => {
            const batchResults = prepareBatchEnqueueMessages([])
            assert.strictEqual(batchResults.length, 0)
        })
    })
})
