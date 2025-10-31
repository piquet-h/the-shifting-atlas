import assert from 'node:assert'
import { test } from 'node:test'
import { queueProcessWorldEvent } from '../../src/functions/queueProcessWorldEvent.js'
import '../../src/instrumentation/opentelemetry.js'
import { getFinishedSpans, resetFinishedSpans } from '../../src/instrumentation/opentelemetry.js'

const TRACEPARENT = '00-cccccccccccccccccccccccccccccccc-dddddddddddddddd-01'

// Minimal valid world event envelope for processing
const sampleEvent = {
    eventId: '123e4567-e89b-12d3-a456-426614174000',
    type: 'LocationGenerated',
    actor: { kind: 'system' },
    idempotencyKey: 'idem-key-1',
    occurredUtc: new Date().toISOString(),
    correlationId: 'corr-1'
}

function makeContext() {
    return {
        invocationId: 'inv-1',
        functionName: 'QueueProcessWorldEvent',
        log: () => {},
        error: () => {},
        extraInputs: new Map()
    } as any
}

test('ServiceBus span reuses traceparent traceId', async () => {
    resetFinishedSpans()
    const message = { body: sampleEvent, applicationProperties: { traceparent: TRACEPARENT } }
    await queueProcessWorldEvent(message, makeContext())
    const spans = getFinishedSpans()
    const sbSpan = spans.find((s) => s.name === 'ServiceBus QueueProcessWorldEvent')
    assert.ok(sbSpan, 'Expected ServiceBus span')
    assert.equal(sbSpan!.spanContext().traceId, 'cccccccccccccccccccccccccccccccc')
})
