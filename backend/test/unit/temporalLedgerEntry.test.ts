/**
 * Unit tests for Temporal Ledger Entry models and utilities
 */

import assert from 'node:assert'
import { describe, test } from 'node:test'
import {
    buildPlayerScopeKey,
    buildWcScopeKey,
    parseScopeKey,
    type TemporalLedgerEntry
} from '@piquet-h/shared'

describe('TemporalLedgerEntry utilities', () => {
    describe('buildWcScopeKey', () => {
        test('returns world clock scope key', () => {
            const scopeKey = buildWcScopeKey()
            assert.strictEqual(scopeKey, 'wc')
        })
    })

    describe('buildPlayerScopeKey', () => {
        test('builds player scope key with playerId', () => {
            const playerId = 'player-123'
            const scopeKey = buildPlayerScopeKey(playerId)
            assert.strictEqual(scopeKey, 'player:player-123')
        })

        test('handles UUID player IDs', () => {
            const playerId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
            const scopeKey = buildPlayerScopeKey(playerId)
            assert.strictEqual(scopeKey, 'player:a1b2c3d4-e5f6-7890-abcd-ef1234567890')
        })
    })

    describe('parseScopeKey', () => {
        test('parses world clock scope key', () => {
            const result = parseScopeKey('wc')
            assert.deepStrictEqual(result, { type: 'wc' })
        })

        test('parses player scope key', () => {
            const result = parseScopeKey('player:player-123')
            assert.deepStrictEqual(result, { type: 'player', playerId: 'player-123' })
        })

        test('parses player scope key with UUID', () => {
            const playerId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
            const result = parseScopeKey(`player:${playerId}`)
            assert.deepStrictEqual(result, { type: 'player', playerId })
        })

        test('throws on invalid scope key', () => {
            assert.throws(
                () => parseScopeKey('invalid'),
                /Invalid temporal ledger scope key/
            )
        })

        test('throws on malformed player scope key', () => {
            assert.throws(
                () => parseScopeKey('player'),
                /Invalid temporal ledger scope key/
            )
        })
    })

    describe('TemporalLedgerEntry type', () => {
        test('accepts valid entry with all required fields', () => {
            const entry: TemporalLedgerEntry = {
                id: crypto.randomUUID(),
                scopeKey: buildWcScopeKey(),
                eventType: 'WorldClockAdvanced',
                timestamp: new Date().toISOString(),
                worldClockTick: 1000
            }

            assert.ok(entry.id)
            assert.strictEqual(entry.scopeKey, 'wc')
            assert.strictEqual(entry.eventType, 'WorldClockAdvanced')
        })

        test('accepts entry with optional fields', () => {
            const entry: TemporalLedgerEntry = {
                id: crypto.randomUUID(),
                scopeKey: buildPlayerScopeKey('player-123'),
                eventType: 'PlayerActionAdvanced',
                timestamp: new Date().toISOString(),
                worldClockTick: 2000,
                actorId: 'player-123',
                locationId: 'loc-456',
                durationMs: 60000,
                metadata: { actionType: 'move', direction: 'north' }
            }

            assert.strictEqual(entry.actorId, 'player-123')
            assert.strictEqual(entry.locationId, 'loc-456')
            assert.strictEqual(entry.durationMs, 60000)
            assert.deepStrictEqual(entry.metadata, { actionType: 'move', direction: 'north' })
        })

        test('accepts reconciliation entry with reconciliationMethod', () => {
            const entry: TemporalLedgerEntry = {
                id: crypto.randomUUID(),
                scopeKey: buildPlayerScopeKey('player-123'),
                eventType: 'Reconciled',
                timestamp: new Date().toISOString(),
                worldClockTick: 3000,
                actorId: 'player-123',
                locationId: 'loc-789',
                reconciliationMethod: 'wait'
            }

            assert.strictEqual(entry.reconciliationMethod, 'wait')
        })
    })
})
