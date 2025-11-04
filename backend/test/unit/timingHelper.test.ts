import assert from 'node:assert'
import { test } from 'node:test'
import { __startTimingTest } from '../../src/telemetry/timing.js'

interface CapturedTimingEvent {
    name: string
    properties: Record<string, unknown>
}

const captured: CapturedTimingEvent[] = []

test('Timing helper emits Timing.Op with opName and durationMs', () => {
    captured.length = 0
    const h = __startTimingTest('SyntheticWork', (name, properties) => {
        captured.push({ name, properties })
    })
    let acc = 0
    for (let i = 0; i < 10_000; i++) acc += i
    h.stop({ result: acc })
    assert.equal(captured.length, 1, 'Expected exactly one event')
    const evt = captured[0]
    assert.equal(evt.name, 'Timing.Op')
    assert.equal(evt.properties.opName, 'SyntheticWork')
    assert.ok(typeof evt.properties.durationMs === 'number')
    assert.ok((evt.properties.durationMs as number) >= 0)
    assert.equal(evt.properties.result, acc)
})

test('Double stop is idempotent (second stop ignored)', () => {
    captured.length = 0
    const h = __startTimingTest('IdempotentTest', (name, properties) => {
        captured.push({ name, properties })
    })
    h.stop()
    h.stop({ ignored: true })
    assert.equal(captured.length, 1, 'Second stop should not emit a second event')
})

test('Timing helper propagates correlationId override', () => {
    captured.length = 0
    const h = __startTimingTest(
        'CorrelationTest',
        (name, properties) => {
            captured.push({ name, properties })
        },
        { correlationId: 'corr-123' }
    )
    h.stop()
    const evt = captured[0]
    assert.equal(evt.properties.correlationId, 'corr-123')
})
// No global cleanup needed; test helper restores sink automatically.
