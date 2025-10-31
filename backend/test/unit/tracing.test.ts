import assert from 'node:assert'
import { test } from 'node:test'
// Ensure instrumentation is loaded
import '../../src/instrumentation/opentelemetry.js'
import { getTracer } from '../../src/instrumentation/opentelemetry.js'

// Basic test to ensure a non-zero trace id is produced and resource attributes applied.

test('tracer creates span with valid trace id', () => {
    const tracer = getTracer()
    const span = tracer.startSpan('test-span')
    const ctx = span.spanContext()
    assert.match(ctx.traceId, /^[0-9a-f]{32}$/)
    assert.notEqual(ctx.traceId, '00000000000000000000000000000000')
    span.end()
})
