import assert from 'node:assert'
import { test } from 'node:test'
import '../../src/instrumentation/opentelemetry.js'
import { endSpan, getFinishedSpans, resetFinishedSpans, startHttpSpan } from '../../src/instrumentation/opentelemetry.js'

const TRACEPARENT = '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01'

class MockHeaders {
    private map: Record<string, string>
    constructor(entries: Record<string, string>) {
        this.map = entries
    }
    get(name: string): string | null {
        return this.map[name.toLowerCase()] || null
    }
}

test('HTTP span reuses incoming traceparent traceId', () => {
    resetFinishedSpans()
    const headers = new MockHeaders({ traceparent: TRACEPARENT })
    const span = startHttpSpan('Http testFunction', headers as unknown as Headers)
    endSpan(span)
    const spans = getFinishedSpans()
    assert.ok(spans.length > 0)
    const last = spans[spans.length - 1]
    assert.equal(last.spanContext().traceId, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
})
