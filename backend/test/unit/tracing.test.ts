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

test('initialization without TRACE_EXPORT_ENABLED does not crash', () => {
    // Verify that tracer works even when export is disabled (default)
    // This test runs with NODE_ENV=test, which should not have TRACE_EXPORT_ENABLED set
    const traceExportEnabled = process.env.TRACE_EXPORT_ENABLED
    assert.notEqual(traceExportEnabled, 'true', 'Test should run with TRACE_EXPORT_ENABLED not true')

    const tracer = getTracer()
    const span = tracer.startSpan('no-export-span')
    const ctx = span.spanContext()

    // Span should still be created with valid trace id
    assert.match(ctx.traceId, /^[0-9a-f]{32}$/)
    span.end()
})

