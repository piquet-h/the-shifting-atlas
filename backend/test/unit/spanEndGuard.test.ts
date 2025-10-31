import assert from 'node:assert'
import { test } from 'node:test'
import '../../src/instrumentation/opentelemetry.js'
import { endSpan, getTracer } from '../../src/instrumentation/opentelemetry.js'

test('endSpan guard prevents second end invocation', () => {
    const span = getTracer().startSpan('GuardTest')
    // First end should succeed
    endSpan(span)
    let calledAgain = false
    // Monkey patch end to detect second invocation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalEnd = (span as any).end.bind(span)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(span as any).end = function (...args: unknown[]) {
        calledAgain = true
        return originalEnd(...args)
    }
    // Second endSpan should be a no-op due to guard
    endSpan(span)
    assert.equal(calledAgain, false, 'span.end() should not be called a second time')
})
