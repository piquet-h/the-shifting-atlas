import assert from 'node:assert'
import { test } from 'node:test'
import { __startTimingTest, __setTimingDebugSink, withTiming } from '../../src/telemetry/timing.js'

interface CapturedTimingEvent {
    name: string
    properties: Record<string, unknown>
}

const captured: CapturedTimingEvent[] = []

// Legacy startTiming tests (backward compatibility)
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

// New withTiming API tests (Issue #353 requirements)
test('withTiming emits Timing.Op with op and ms properties', async () => {
    captured.length = 0
    __setTimingDebugSink((name, properties) => {
        captured.push({ name, properties })
    })

    const result = await withTiming('TestOperation', async () => {
        let acc = 0
        for (let i = 0; i < 10_000; i++) acc += i
        return acc
    })

    assert.ok(typeof result === 'number', 'Function result should be returned')
    assert.equal(captured.length, 1, 'Expected exactly one event')
    const evt = captured[0]
    assert.equal(evt.name, 'Timing.Op')
    assert.equal(evt.properties.op, 'TestOperation')
    assert.ok(typeof evt.properties.ms === 'number', 'ms should be a number')
    assert.ok((evt.properties.ms as number) >= 0, 'ms should be >= 0')
    assert.strictEqual(evt.properties.error, undefined, 'error should not be present on success')

    __setTimingDebugSink(null)
})

test('withTiming supports synchronous functions', async () => {
    captured.length = 0
    __setTimingDebugSink((name, properties) => {
        captured.push({ name, properties })
    })

    const result = await withTiming('SyncOperation', () => {
        return 42
    })

    assert.equal(result, 42, 'Sync function result should be returned')
    assert.equal(captured.length, 1, 'Expected exactly one event')
    const evt = captured[0]
    assert.equal(evt.properties.op, 'SyncOperation')
    assert.ok(typeof evt.properties.ms === 'number')

    __setTimingDebugSink(null)
})

test('withTiming automatically generates correlationId if not provided', async () => {
    captured.length = 0
    __setTimingDebugSink((name, properties) => {
        captured.push({ name, properties })
    })

    await withTiming('CorrelationCheck', () => 'result')

    assert.equal(captured.length, 1)
    const evt = captured[0]
    assert.ok(evt.properties.correlationId, 'correlationId should be auto-generated')
    assert.ok(typeof evt.properties.correlationId === 'string')

    __setTimingDebugSink(null)
})

test('withTiming reuses provided correlationId', async () => {
    captured.length = 0
    __setTimingDebugSink((name, properties) => {
        captured.push({ name, properties })
    })

    await withTiming('CorrelationReuse', () => 'result', { correlationId: 'test-corr-123' })

    assert.equal(captured.length, 1)
    const evt = captured[0]
    assert.equal(evt.properties.correlationId, 'test-corr-123')

    __setTimingDebugSink(null)
})

test('withTiming includes category when provided', async () => {
    captured.length = 0
    __setTimingDebugSink((name, properties) => {
        captured.push({ name, properties })
    })

    await withTiming('CategorizedOperation', () => 'result', { category: 'repository' })

    assert.equal(captured.length, 1)
    const evt = captured[0]
    assert.equal(evt.properties.category, 'repository')

    __setTimingDebugSink(null)
})

test('withTiming omits category when not provided', async () => {
    captured.length = 0
    __setTimingDebugSink((name, properties) => {
        captured.push({ name, properties })
    })

    await withTiming('NoCategoryOperation', () => 'result')

    assert.equal(captured.length, 1)
    const evt = captured[0]
    assert.strictEqual(evt.properties.category, undefined)

    __setTimingDebugSink(null)
})

test('withTiming bubbles errors and emits event with error flag when includeErrorFlag is true', async () => {
    captured.length = 0
    __setTimingDebugSink((name, properties) => {
        captured.push({ name, properties })
    })

    const testError = new Error('Test error')
    await assert.rejects(
        async () => {
            await withTiming(
                'FailingOperation',
                () => {
                    throw testError
                },
                { includeErrorFlag: true }
            )
        },
        testError,
        'Error should be re-thrown'
    )

    assert.equal(captured.length, 1, 'Event should still be emitted on error')
    const evt = captured[0]
    assert.equal(evt.properties.op, 'FailingOperation')
    assert.equal(evt.properties.error, true, 'error flag should be true')
    assert.ok(typeof evt.properties.ms === 'number')

    __setTimingDebugSink(null)
})

test('withTiming bubbles errors without error flag when includeErrorFlag is false', async () => {
    captured.length = 0
    __setTimingDebugSink((name, properties) => {
        captured.push({ name, properties })
    })

    const testError = new Error('Test error')
    await assert.rejects(
        async () => {
            await withTiming('FailingOperationNoFlag', () => {
                throw testError
            })
        },
        testError
    )

    assert.equal(captured.length, 1, 'Event should still be emitted on error')
    const evt = captured[0]
    assert.strictEqual(evt.properties.error, undefined, 'error flag should not be present')

    __setTimingDebugSink(null)
})

test('withTiming handles very fast operations (less than 1ms)', async () => {
    captured.length = 0
    __setTimingDebugSink((name, properties) => {
        captured.push({ name, properties })
    })

    await withTiming('FastOperation', () => 42)

    assert.equal(captured.length, 1)
    const evt = captured[0]
    assert.ok(typeof evt.properties.ms === 'number')
    assert.ok((evt.properties.ms as number) >= 0, 'ms should be >= 0 for very fast operations')

    __setTimingDebugSink(null)
})

// No global cleanup needed; test helper restores sink automatically.
