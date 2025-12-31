/**
 * Integration tests for World Clock Service
 * Tests service and repository operations in both memory and cosmos modes
 */

import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { ConcurrentAdvancementError } from '../../src/repos/worldClockRepository.js'
import { describeForBothModes } from '../helpers/describeForBothModes.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describeForBothModes('WorldClockService Integration', (mode) => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture(mode)
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('getCurrentTick', () => {
        test('returns 0 for uninitialized clock', async () => {
            const service = await fixture.getWorldClockService()

            const tick = await service.getCurrentTick()
            assert.strictEqual(tick, 0)
        })

        test('returns current tick after advancement', async () => {
            const service = await fixture.getWorldClockService()

            await service.advanceTick(1000, 'test')
            const tick = await service.getCurrentTick()

            assert.strictEqual(tick, 1000)
        })
    })

    describe('advanceTick', () => {
        test('advances clock and emits telemetry', async () => {
            const service = await fixture.getWorldClockService()
            const telemetry = await fixture.getTelemetryClient()

            const newTick = await service.advanceTick(2000, 'test advancement')

            assert.strictEqual(newTick, 2000)

            // Verify telemetry event was emitted
            const events = telemetry.events.filter((e) => e.name === 'World.Clock.Advanced')
            assert.strictEqual(events.length, 1)
            assert.strictEqual(events[0].properties?.durationMs, 2000)
            assert.strictEqual(events[0].properties?.newTick, 2000)
            assert.strictEqual(events[0].properties?.reason, 'test advancement')
        })

        test('cumulative advancements', async () => {
            const service = await fixture.getWorldClockService()

            await service.advanceTick(1000, 'first')
            await service.advanceTick(500, 'second')
            await service.advanceTick(250, 'third')

            const tick = await service.getCurrentTick()
            assert.strictEqual(tick, 1750)
        })

        test('rejects negative duration', async () => {
            const service = await fixture.getWorldClockService()

            await assert.rejects(async () => service.advanceTick(-1000, 'invalid'), /must be positive/i)
        })

        test('rejects zero duration', async () => {
            const service = await fixture.getWorldClockService()

            await assert.rejects(async () => service.advanceTick(0, 'invalid'), /must be positive/i)
        })

        test('records advancement in history', async () => {
            const service = await fixture.getWorldClockService()
            const repo = await fixture.getWorldClockRepository()

            await service.advanceTick(1000, 'first')
            await service.advanceTick(500, 'second')

            const clock = await repo.get()
            assert.ok(clock)
            assert.strictEqual(clock.advancementHistory.length, 2)
            assert.strictEqual(clock.advancementHistory[0].durationMs, 1000)
            assert.strictEqual(clock.advancementHistory[0].reason, 'first')
            assert.strictEqual(clock.advancementHistory[0].tickAfter, 1000)
            assert.strictEqual(clock.advancementHistory[1].durationMs, 500)
            assert.strictEqual(clock.advancementHistory[1].reason, 'second')
            assert.strictEqual(clock.advancementHistory[1].tickAfter, 1500)
        })
    })

    describe('getTickAt', () => {
        test('returns null for timestamp before initialization', async () => {
            const service = await fixture.getWorldClockService()
            const clock = await fixture.getClock()

            const pastDate = new Date(clock.now().getTime() - 10000)
            const tick = await service.getTickAt(pastDate)

            assert.strictEqual(tick, null)
        })

        test('returns 0 for timestamp at initialization', async () => {
            const service = await fixture.getWorldClockService()
            const clock = await fixture.getClock()

            // Initialize clock
            await service.getCurrentTick()

            // Query at initialization time
            const tick = await service.getTickAt(clock.now())

            assert.strictEqual(tick, 0)
        })

        test('returns tick at specific timestamp after advancements', async () => {
            const service = await fixture.getWorldClockService()
            const clock = await fixture.getClock()

            // Initialize at T0
            await service.getCurrentTick()

            // Advance time and advance tick
            clock.advance(10)
            await service.advanceTick(1000, 'first')
            const firstTime = clock.now() // Capture after advancement

            // Advance time and advance tick again
            clock.advance(10)
            await service.advanceTick(500, 'second')
            const secondTime = clock.now() // Capture after advancement

            // Query at first timestamp should return 1000
            const tickAtFirst = await service.getTickAt(firstTime)
            assert.strictEqual(tickAtFirst, 1000)

            // Query at second timestamp should return 1500
            const tickAtSecond = await service.getTickAt(secondTime)
            assert.strictEqual(tickAtSecond, 1500)
        })

        test('returns current tick for future timestamp', async () => {
            const service = await fixture.getWorldClockService()
            const clock = await fixture.getClock()

            await service.advanceTick(1000, 'test')

            const futureDate = new Date(clock.now().getTime() + 10000)
            const tick = await service.getTickAt(futureDate)

            assert.strictEqual(tick, 1000)
        })
    })

    describe('concurrent advancement (optimistic concurrency)', () => {
        test('second concurrent advancement fails with conflict error', async () => {
            const service = await fixture.getWorldClockService()
            const repo = await fixture.getWorldClockRepository()

            // First advancement
            await service.advanceTick(1000, 'first')

            // Get current state
            const clock = await repo.get()
            assert.ok(clock)
            const etag = clock._etag!

            // Second advancement succeeds (updates ETag)
            await service.advanceTick(500, 'second')

            // Attempt to advance using old ETag should fail
            await assert.rejects(async () => repo.advance(250, 'concurrent', etag), ConcurrentAdvancementError)
        })

        test('service handles concurrent advancement gracefully', async () => {
            const service = await fixture.getWorldClockService()

            // Multiple rapid advancements should all succeed
            // (service fetches fresh ETag each time)
            await service.advanceTick(100, 'first')
            await service.advanceTick(200, 'second')
            await service.advanceTick(300, 'third')

            const tick = await service.getCurrentTick()
            assert.strictEqual(tick, 600)
        })
    })
})
