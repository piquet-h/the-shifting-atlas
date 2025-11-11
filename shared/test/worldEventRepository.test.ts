/**
 * Unit tests for world event repository types and utilities
 */
import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import {
    buildLocationScopeKey,
    buildPlayerScopeKey,
    buildGlobalScopeKey,
    parseScopeKey,
    type WorldEventRecord,
    type EventStatus,
    type TimelineQueryOptions
} from '../src/types/worldEventRepository.js'

describe('World Event Repository Utilities', () => {
    describe('buildLocationScopeKey', () => {
        it('should build location scope key with loc: prefix', () => {
            const locationId = '12345678-1234-1234-1234-123456789abc'
            const scopeKey = buildLocationScopeKey(locationId)
            assert.equal(scopeKey, `loc:${locationId}`)
        })

        it('should handle different location IDs', () => {
            const locationId1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
            const locationId2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
            assert.equal(buildLocationScopeKey(locationId1), `loc:${locationId1}`)
            assert.equal(buildLocationScopeKey(locationId2), `loc:${locationId2}`)
        })
    })

    describe('buildPlayerScopeKey', () => {
        it('should build player scope key with player: prefix', () => {
            const playerId = '12345678-1234-1234-1234-123456789abc'
            const scopeKey = buildPlayerScopeKey(playerId)
            assert.equal(scopeKey, `player:${playerId}`)
        })

        it('should handle different player IDs', () => {
            const playerId1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
            const playerId2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
            assert.equal(buildPlayerScopeKey(playerId1), `player:${playerId1}`)
            assert.equal(buildPlayerScopeKey(playerId2), `player:${playerId2}`)
        })
    })

    describe('buildGlobalScopeKey', () => {
        it('should build global scope key with global: prefix', () => {
            const category = 'maintenance'
            const scopeKey = buildGlobalScopeKey(category)
            assert.equal(scopeKey, 'global:maintenance')
        })

        it('should handle different categories', () => {
            assert.equal(buildGlobalScopeKey('tick'), 'global:tick')
            assert.equal(buildGlobalScopeKey('system'), 'global:system')
            assert.equal(buildGlobalScopeKey('backup'), 'global:backup')
        })
    })

    describe('parseScopeKey', () => {
        it('should parse location scope key', () => {
            const locationId = '12345678-1234-1234-1234-123456789abc'
            const scopeKey = `loc:${locationId}`
            const parsed = parseScopeKey(scopeKey)

            assert.ok(parsed, 'parsed should not be null')
            assert.equal(parsed.type, 'loc')
            assert.equal(parsed.id, locationId)
        })

        it('should parse player scope key', () => {
            const playerId = '12345678-1234-1234-1234-123456789abc'
            const scopeKey = `player:${playerId}`
            const parsed = parseScopeKey(scopeKey)

            assert.ok(parsed, 'parsed should not be null')
            assert.equal(parsed.type, 'player')
            assert.equal(parsed.id, playerId)
        })

        it('should parse global scope key', () => {
            const scopeKey = 'global:maintenance'
            const parsed = parseScopeKey(scopeKey)

            assert.ok(parsed, 'parsed should not be null')
            assert.equal(parsed.type, 'global')
            assert.equal(parsed.id, 'maintenance')
        })

        it('should return null for invalid scope key format', () => {
            assert.equal(parseScopeKey('invalid'), null)
            assert.equal(parseScopeKey(''), null)
            assert.equal(parseScopeKey('unknown:id'), null)
            assert.equal(parseScopeKey('loc'), null)
            assert.equal(parseScopeKey(':12345'), null)
        })

        it('should handle scope keys with colons in the ID part', () => {
            const scopeKey = 'global:category:subcategory'
            const parsed = parseScopeKey(scopeKey)

            assert.ok(parsed, 'parsed should not be null')
            assert.equal(parsed.type, 'global')
            assert.equal(parsed.id, 'category:subcategory')
        })
    })

    describe('WorldEventRecord type validation', () => {
        it('should validate a complete world event record', () => {
            const record: WorldEventRecord = {
                id: '12345678-1234-1234-1234-123456789abc',
                scopeKey: 'loc:87654321-4321-4321-4321-210987654321',
                eventType: 'Player.Move',
                status: 'processed',
                occurredUtc: '2025-11-11T00:00:00.000Z',
                ingestedUtc: '2025-11-11T00:00:01.000Z',
                processedUtc: '2025-11-11T00:00:02.000Z',
                actorKind: 'player',
                actorId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                correlationId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
                causationId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
                idempotencyKey: 'player:move:12345:1700000000',
                payload: { fromLocationId: 'loc1', toLocationId: 'loc2', direction: 'north' },
                processingMetadata: { ruCost: 5.5, latencyMs: 150 },
                version: 1
            }

            // Type check - should compile without errors
            assert.ok(record.id)
            assert.ok(record.scopeKey)
            assert.ok(record.eventType)
            assert.ok(record.status)
        })

        it('should allow minimal world event record', () => {
            const record: WorldEventRecord = {
                id: '12345678-1234-1234-1234-123456789abc',
                scopeKey: 'player:87654321-4321-4321-4321-210987654321',
                eventType: 'Player.Look',
                status: 'pending',
                occurredUtc: '2025-11-11T00:00:00.000Z',
                ingestedUtc: '2025-11-11T00:00:01.000Z',
                actorKind: 'player',
                correlationId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
                idempotencyKey: 'player:look:12345:1700000000',
                payload: {},
                version: 1
            }

            // Type check - should compile without errors
            assert.ok(record.id)
            assert.equal(record.status, 'pending')
            assert.equal(record.actorId, undefined)
            assert.equal(record.causationId, undefined)
            assert.equal(record.processedUtc, undefined)
        })
    })

    describe('EventStatus type', () => {
        it('should include all expected status values', () => {
            const statuses: EventStatus[] = ['pending', 'processed', 'failed', 'dead_lettered']

            statuses.forEach((status) => {
                const record: Partial<WorldEventRecord> = { status }
                assert.ok(record.status)
            })
        })
    })

    describe('TimelineQueryOptions type', () => {
        it('should allow all query option combinations', () => {
            const options1: TimelineQueryOptions = {
                limit: 100
            }

            const options2: TimelineQueryOptions = {
                limit: 50,
                status: 'processed',
                afterTimestamp: '2025-11-01T00:00:00.000Z',
                beforeTimestamp: '2025-11-11T00:00:00.000Z',
                order: 'desc'
            }

            const options3: TimelineQueryOptions = {}

            // Type checks - should compile without errors
            assert.ok(options1)
            assert.ok(options2)
            assert.ok(options3)
        })
    })

    describe('Scope key pattern round-trip', () => {
        it('should round-trip location scope keys', () => {
            const locationId = '12345678-1234-1234-1234-123456789abc'
            const scopeKey = buildLocationScopeKey(locationId)
            const parsed = parseScopeKey(scopeKey)

            assert.ok(parsed)
            assert.equal(parsed.type, 'loc')
            assert.equal(parsed.id, locationId)
        })

        it('should round-trip player scope keys', () => {
            const playerId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
            const scopeKey = buildPlayerScopeKey(playerId)
            const parsed = parseScopeKey(scopeKey)

            assert.ok(parsed)
            assert.equal(parsed.type, 'player')
            assert.equal(parsed.id, playerId)
        })

        it('should round-trip global scope keys', () => {
            const category = 'system-tick'
            const scopeKey = buildGlobalScopeKey(category)
            const parsed = parseScopeKey(scopeKey)

            assert.ok(parsed)
            assert.equal(parsed.type, 'global')
            assert.equal(parsed.id, category)
        })
    })
})
