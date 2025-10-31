/**
 * Tests for Dead-Letter Storage and Redaction
 */
import assert from 'node:assert'
import { describe, test } from 'node:test'
import { createDeadLetterRecord, redactEnvelope } from '../../../shared/src/deadLetter.js'

describe('Dead-Letter Redaction', () => {
    describe('redactEnvelope', () => {
        test('should redact player IDs keeping last 4 characters', () => {
            const envelope = {
                eventId: '12345678-1234-4234-8234-123456789012',
                actor: {
                    kind: 'player',
                    id: '98765432-9876-4876-8876-987654321098'
                }
            }

            const redacted = redactEnvelope(envelope)

            assert.ok(redacted.actor)
            assert.strictEqual(typeof redacted.actor, 'object')
            const actor = redacted.actor as Record<string, unknown>
            assert.strictEqual(actor.kind, 'player')
            assert.strictEqual(typeof actor.id, 'string')
            // Should keep last 4 chars
            assert.ok((actor.id as string).endsWith('1098'))
            // Should mask earlier parts
            assert.ok((actor.id as string).includes('*'))
        })

        test('should replace payload with type summary', () => {
            const envelope = {
                eventId: 'test-id',
                payload: {
                    playerId: '12345678-1234-4234-8234-123456789012',
                    locationId: 'loc-123',
                    direction: 'north',
                    timestamp: '2025-10-31T12:00:00Z'
                }
            }

            const redacted = redactEnvelope(envelope)

            assert.ok(redacted.payload)
            const payload = redacted.payload as Record<string, unknown>
            // Should have summary fields
            assert.strictEqual(payload._fieldCount, 4)
            assert.ok(Array.isArray(payload._fields))
            assert.strictEqual((payload._fields as string[]).length, 4)
            // Should redact IDs in summary
            assert.ok(payload.playerId)
            assert.strictEqual(typeof payload.playerId, 'string')
            assert.ok((payload.playerId as string).includes('*'))
        })

        test('should preserve non-sensitive fields', () => {
            const envelope = {
                eventId: 'event-123',
                type: 'Player.Move',
                version: 1,
                occurredUtc: '2025-10-31T12:00:00Z',
                correlationId: 'corr-123'
            }

            const redacted = redactEnvelope(envelope)

            assert.strictEqual(redacted.eventId, 'event-123')
            assert.strictEqual(redacted.type, 'Player.Move')
            assert.strictEqual(redacted.version, 1)
            assert.strictEqual(redacted.occurredUtc, '2025-10-31T12:00:00Z')
            assert.strictEqual(redacted.correlationId, 'corr-123')
        })

        test('should handle non-object envelopes', () => {
            const redacted = redactEnvelope('invalid string')

            assert.ok(redacted._raw)
            assert.strictEqual(redacted._raw, 'invalid string')
        })

        test('should truncate extremely large strings', () => {
            const largeString = 'x'.repeat(15000)
            const envelope = {
                eventId: 'test',
                largeField: largeString
            }

            const redacted = redactEnvelope(envelope)

            assert.ok(redacted.largeField)
            assert.strictEqual(typeof redacted.largeField, 'string')
            const field = redacted.largeField as string
            assert.ok(field.length < 15000)
            assert.ok(field.includes('[TRUNCATED]'))
        })

        test('should truncate large arrays', () => {
            const largeArray = Array.from({ length: 20 }, (_, i) => `item-${i}`)
            const envelope = {
                eventId: 'test',
                items: largeArray
            }

            const redacted = redactEnvelope(envelope)

            assert.ok(Array.isArray(redacted.items))
            const items = redacted.items as unknown[]
            // Should limit to 10 items + truncation marker
            assert.ok(items.length <= 11)
            assert.ok(items.includes('...[TRUNCATED]'))
        })
    })

    describe('createDeadLetterRecord', () => {
        test('should create dead-letter record with all metadata', () => {
            const rawEvent = {
                eventId: '12345678-1234-4234-8234-123456789012',
                type: 'Player.Move',
                occurredUtc: '2025-10-31T12:00:00Z',
                correlationId: 'corr-123',
                actor: {
                    kind: 'player',
                    id: 'player-123'
                },
                payload: {
                    test: 'data'
                }
            }

            const error = {
                category: 'schema-validation',
                message: 'Invalid schema',
                issues: [
                    {
                        path: 'type',
                        message: 'Invalid type',
                        code: 'invalid_enum_value'
                    }
                ]
            }

            const record = createDeadLetterRecord(rawEvent, error)

            assert.ok(record.id)
            assert.strictEqual(record.originalEventId, '12345678-1234-4234-8234-123456789012')
            assert.strictEqual(record.eventType, 'Player.Move')
            assert.strictEqual(record.actorKind, 'player')
            assert.strictEqual(record.occurredUtc, '2025-10-31T12:00:00Z')
            assert.strictEqual(record.correlationId, 'corr-123')
            assert.ok(record.redactedEnvelope)
            assert.strictEqual(record.error.category, 'schema-validation')
            assert.strictEqual(record.error.message, 'Invalid schema')
            assert.strictEqual(record.error.issues?.length, 1)
            assert.ok(record.deadLetteredUtc)
            assert.strictEqual(record.redacted, true)
            assert.strictEqual(record.partitionKey, 'deadletter')
        })

        test('should handle unparseable events', () => {
            const rawEvent = 'invalid json string'

            const error = {
                category: 'json-parse',
                message: 'Failed to parse JSON'
            }

            const record = createDeadLetterRecord(rawEvent, error)

            assert.ok(record.id)
            assert.strictEqual(record.originalEventId, undefined)
            assert.strictEqual(record.eventType, undefined)
            assert.strictEqual(record.actorKind, undefined)
            assert.strictEqual(record.error.category, 'json-parse')
            assert.ok(record.redactedEnvelope._raw)
        })

        test('should extract partial metadata from invalid events', () => {
            const rawEvent = {
                eventId: 'valid-id',
                // Missing type and other required fields
                actor: {
                    kind: 'npc'
                    // Missing id
                }
            }

            const error = {
                category: 'schema-validation',
                message: 'Missing required fields'
            }

            const record = createDeadLetterRecord(rawEvent, error)

            assert.strictEqual(record.originalEventId, 'valid-id')
            assert.strictEqual(record.actorKind, 'npc')
            assert.strictEqual(record.eventType, undefined)
        })
    })
})
