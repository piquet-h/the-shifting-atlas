import assert from 'node:assert'
import { test } from 'node:test'
import {
    attachTraceparentToServiceBusMessage,
    createTraceparent,
    extractOrCreateTraceparent,
    extractTraceparentFromServiceBusMessage,
    parseTraceparent
} from '../src/utils/traceparent.js'

const VALID = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'

test('parseTraceparent valid', () => {
    const parsed = parseTraceparent(VALID)
    assert.ok(parsed)
    assert.equal(parsed?.traceId, '4bf92f3577b34da6a3ce929d0e0e4736')
    assert.equal(parsed?.parentId, '00f067aa0ba902b7')
})

test('parseTraceparent invalid returns null', () => {
    assert.equal(parseTraceparent('bad-value'), null)
    assert.equal(parseTraceparent('00-00000000000000000000000000000000-0000000000000000-00'), null)
})

test('createTraceparent generates proper header format', () => {
    const { header } = createTraceparent(null)
    const re = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/
    assert.ok(re.test(header))
})

test('extractOrCreateTraceparent reuses existing trace id', () => {
    const first = extractOrCreateTraceparent((n) => (n === 'traceparent' ? VALID : null))
    assert.equal(first.reused, true)
    assert.equal(first.traceId, '4bf92f3577b34da6a3ce929d0e0e4736')
})

test('attach/extract traceparent on service bus message', () => {
    const { header } = createTraceparent(null)
    const msg = { body: { hello: 'world' } }
    attachTraceparentToServiceBusMessage(msg, header)
    const roundTrip = extractTraceparentFromServiceBusMessage(msg)
    assert.equal(roundTrip, header)
})
