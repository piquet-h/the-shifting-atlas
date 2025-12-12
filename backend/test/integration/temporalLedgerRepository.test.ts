/**
 * Integration tests for Temporal Ledger Repository
 * Tests repository operations with dependency injection container
 */

import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { buildPlayerScopeKey, buildWcScopeKey, type TemporalLedgerEntry } from '@piquet-h/shared'
import { describeForBothModes } from '../helpers/describeForBothModes.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describeForBothModes('Temporal Ledger Repository Integration', (mode) => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture(mode)
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('log entry', () => {
        test('creates document with correct partition key', async () => {
            const repo = await fixture.getTemporalLedgerRepository()
            const playerId = crypto.randomUUID()

            const entry: TemporalLedgerEntry = {
                id: crypto.randomUUID(),
                scopeKey: buildPlayerScopeKey(playerId),
                eventType: 'PlayerActionAdvanced',
                timestamp: new Date().toISOString(),
                worldClockTick: 1000,
                actorId: playerId,
                locationId: 'loc-123',
                durationMs: 60000
            }

            const result = await repo.log(entry)

            assert.ok(result)
            assert.strictEqual(result.id, entry.id)
            assert.strictEqual(result.scopeKey, buildPlayerScopeKey(playerId))
            assert.strictEqual(result.eventType, 'PlayerActionAdvanced')
            assert.strictEqual(result.worldClockTick, 1000)
            assert.strictEqual(result.actorId, playerId)
            assert.strictEqual(result.locationId, 'loc-123')
            assert.strictEqual(result.durationMs, 60000)
        })

        test('is idempotent (upsert semantics)', async () => {
            const repo = await fixture.getTemporalLedgerRepository()

            const entry: TemporalLedgerEntry = {
                id: crypto.randomUUID(),
                scopeKey: buildWcScopeKey(),
                eventType: 'WorldClockAdvanced',
                timestamp: new Date().toISOString(),
                worldClockTick: 2000,
                durationMs: 1000
            }

            // Log twice - should not error
            const first = await repo.log(entry)
            const second = await repo.log(entry)

            assert.strictEqual(first.id, entry.id)
            assert.strictEqual(second.id, entry.id)
        })

        test('handles missing optional fields gracefully', async () => {
            const repo = await fixture.getTemporalLedgerRepository()

            const entry: TemporalLedgerEntry = {
                id: crypto.randomUUID(),
                scopeKey: buildWcScopeKey(),
                eventType: 'WorldClockAdvanced',
                timestamp: new Date().toISOString(),
                worldClockTick: 3000
                // No actorId, locationId, durationMs, reconciliationMethod, metadata
            }

            const result = await repo.log(entry)

            assert.ok(result)
            assert.strictEqual(result.id, entry.id)
            assert.strictEqual(result.actorId, undefined)
            assert.strictEqual(result.locationId, undefined)
            assert.strictEqual(result.durationMs, undefined)
            assert.strictEqual(result.reconciliationMethod, undefined)
            assert.strictEqual(result.metadata, undefined)
        })
    })

    describe('query by player', () => {
        test('returns only player-scoped events', async () => {
            const repo = await fixture.getTemporalLedgerRepository()
            const playerId = crypto.randomUUID()
            const otherPlayerId = crypto.randomUUID()

            // Create entries for different players and world clock
            await repo.log({
                id: crypto.randomUUID(),
                scopeKey: buildPlayerScopeKey(playerId),
                eventType: 'PlayerActionAdvanced',
                timestamp: new Date(Date.now() - 3000).toISOString(),
                worldClockTick: 1000,
                actorId: playerId
            })

            await repo.log({
                id: crypto.randomUUID(),
                scopeKey: buildPlayerScopeKey(playerId),
                eventType: 'PlayerDriftApplied',
                timestamp: new Date(Date.now() - 2000).toISOString(),
                worldClockTick: 2000,
                actorId: playerId
            })

            await repo.log({
                id: crypto.randomUUID(),
                scopeKey: buildPlayerScopeKey(otherPlayerId),
                eventType: 'PlayerActionAdvanced',
                timestamp: new Date(Date.now() - 1000).toISOString(),
                worldClockTick: 1500,
                actorId: otherPlayerId
            })

            await repo.log({
                id: crypto.randomUUID(),
                scopeKey: buildWcScopeKey(),
                eventType: 'WorldClockAdvanced',
                timestamp: new Date().toISOString(),
                worldClockTick: 3000
            })

            const results = await repo.queryByPlayer(playerId)

            assert.strictEqual(results.length, 2)
            assert.ok(results.every((r) => r.scopeKey === buildPlayerScopeKey(playerId)))
            assert.ok(results.every((r) => r.actorId === playerId))
        })

        test('returns events in descending timestamp order', async () => {
            const repo = await fixture.getTemporalLedgerRepository()
            const playerId = crypto.randomUUID()

            const timestamps = [
                new Date(Date.now() - 5000).toISOString(),
                new Date(Date.now() - 3000).toISOString(),
                new Date(Date.now() - 1000).toISOString()
            ]

            for (const timestamp of timestamps) {
                await repo.log({
                    id: crypto.randomUUID(),
                    scopeKey: buildPlayerScopeKey(playerId),
                    eventType: 'PlayerActionAdvanced',
                    timestamp,
                    worldClockTick: 1000,
                    actorId: playerId
                })
            }

            const results = await repo.queryByPlayer(playerId)

            assert.strictEqual(results.length, 3)
            // Should be in reverse chronological order (newest first)
            assert.ok(new Date(results[0].timestamp) > new Date(results[1].timestamp))
            assert.ok(new Date(results[1].timestamp) > new Date(results[2].timestamp))
        })

        test('respects maxResults parameter', async () => {
            const repo = await fixture.getTemporalLedgerRepository()
            const playerId = crypto.randomUUID()

            // Create 5 entries
            for (let i = 0; i < 5; i++) {
                await repo.log({
                    id: crypto.randomUUID(),
                    scopeKey: buildPlayerScopeKey(playerId),
                    eventType: 'PlayerActionAdvanced',
                    timestamp: new Date(Date.now() - i * 1000).toISOString(),
                    worldClockTick: 1000 + i,
                    actorId: playerId
                })
            }

            const results = await repo.queryByPlayer(playerId, 3)

            assert.strictEqual(results.length, 3)
        })

        test('returns empty array for unknown player', async () => {
            const repo = await fixture.getTemporalLedgerRepository()
            const unknownPlayerId = crypto.randomUUID()

            const results = await repo.queryByPlayer(unknownPlayerId)

            assert.strictEqual(results.length, 0)
        })
    })

    describe('query by world clock', () => {
        test('returns only world clock events', async () => {
            const repo = await fixture.getTemporalLedgerRepository()
            const playerId = crypto.randomUUID()

            // Create world clock and player events
            await repo.log({
                id: crypto.randomUUID(),
                scopeKey: buildWcScopeKey(),
                eventType: 'WorldClockAdvanced',
                timestamp: new Date(Date.now() - 3000).toISOString(),
                worldClockTick: 1000,
                durationMs: 1000
            })

            await repo.log({
                id: crypto.randomUUID(),
                scopeKey: buildWcScopeKey(),
                eventType: 'WorldClockAdvanced',
                timestamp: new Date(Date.now() - 1000).toISOString(),
                worldClockTick: 2000,
                durationMs: 1000
            })

            await repo.log({
                id: crypto.randomUUID(),
                scopeKey: buildPlayerScopeKey(playerId),
                eventType: 'PlayerActionAdvanced',
                timestamp: new Date().toISOString(),
                worldClockTick: 1500,
                actorId: playerId
            })

            const results = await repo.queryByWorldClock()

            assert.strictEqual(results.length, 2)
            assert.ok(results.every((r) => r.scopeKey === buildWcScopeKey()))
            assert.ok(results.every((r) => r.eventType === 'WorldClockAdvanced'))
        })

        test('returns advancement history in descending order', async () => {
            const repo = await fixture.getTemporalLedgerRepository()

            const advancements = [
                { tick: 1000, timestamp: new Date(Date.now() - 3000).toISOString() },
                { tick: 2000, timestamp: new Date(Date.now() - 2000).toISOString() },
                { tick: 3000, timestamp: new Date(Date.now() - 1000).toISOString() }
            ]

            for (const advancement of advancements) {
                await repo.log({
                    id: crypto.randomUUID(),
                    scopeKey: buildWcScopeKey(),
                    eventType: 'WorldClockAdvanced',
                    timestamp: advancement.timestamp,
                    worldClockTick: advancement.tick,
                    durationMs: 1000
                })
            }

            const results = await repo.queryByWorldClock()

            assert.strictEqual(results.length, 3)
            // Newest first
            assert.strictEqual(results[0].worldClockTick, 3000)
            assert.strictEqual(results[1].worldClockTick, 2000)
            assert.strictEqual(results[2].worldClockTick, 1000)
        })
    })

    describe('query by time range', () => {
        test('filters events within time range', async () => {
            const repo = await fixture.getTemporalLedgerRepository()
            const now = Date.now()

            // Events at different times
            const entries = [
                {
                    id: crypto.randomUUID(),
                    timestamp: new Date(now - 5000).toISOString(),
                    tick: 1000
                },
                {
                    id: crypto.randomUUID(),
                    timestamp: new Date(now - 3000).toISOString(),
                    tick: 2000
                },
                {
                    id: crypto.randomUUID(),
                    timestamp: new Date(now - 1000).toISOString(),
                    tick: 3000
                }
            ]

            for (const entry of entries) {
                await repo.log({
                    id: entry.id,
                    scopeKey: buildWcScopeKey(),
                    eventType: 'WorldClockAdvanced',
                    timestamp: entry.timestamp,
                    worldClockTick: entry.tick,
                    durationMs: 1000
                })
            }

            // Query middle entry only
            const results = await repo.queryByTimeRange({
                startTimestamp: new Date(now - 4000).toISOString(),
                endTimestamp: new Date(now - 2000).toISOString()
            })

            assert.strictEqual(results.length, 1)
            assert.strictEqual(results[0].worldClockTick, 2000)
        })

        test('includes boundary events (inclusive range)', async () => {
            const repo = await fixture.getTemporalLedgerRepository()
            const startTime = new Date(Date.now() - 3000)
            const endTime = new Date(Date.now() - 1000)

            // Events at exact boundaries
            await repo.log({
                id: crypto.randomUUID(),
                scopeKey: buildWcScopeKey(),
                eventType: 'WorldClockAdvanced',
                timestamp: startTime.toISOString(),
                worldClockTick: 1000
            })

            await repo.log({
                id: crypto.randomUUID(),
                scopeKey: buildWcScopeKey(),
                eventType: 'WorldClockAdvanced',
                timestamp: endTime.toISOString(),
                worldClockTick: 2000
            })

            const results = await repo.queryByTimeRange({
                startTimestamp: startTime.toISOString(),
                endTimestamp: endTime.toISOString()
            })

            assert.strictEqual(results.length, 2)
        })

        test('respects maxResults parameter', async () => {
            const repo = await fixture.getTemporalLedgerRepository()
            const now = Date.now()

            // Create 5 entries
            for (let i = 0; i < 5; i++) {
                await repo.log({
                    id: crypto.randomUUID(),
                    scopeKey: buildWcScopeKey(),
                    eventType: 'WorldClockAdvanced',
                    timestamp: new Date(now - i * 1000).toISOString(),
                    worldClockTick: 1000 + i
                })
            }

            const results = await repo.queryByTimeRange({
                startTimestamp: new Date(now - 10000).toISOString(),
                endTimestamp: new Date(now).toISOString(),
                maxResults: 3
            })

            assert.strictEqual(results.length, 3)
        })
    })
})
