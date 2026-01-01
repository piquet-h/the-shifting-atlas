import assert from 'node:assert'
import { test } from 'node:test'
import { validateGremlinEndpoint } from '../../src/gremlin/gremlinClient.js'

// Happy path conversion
test('validateGremlinEndpoint converts documents endpoint to gremlin websocket', () => {
    const ws = validateGremlinEndpoint('https://example.documents.azure.com:443/')
    const url = new URL(ws)
    assert.equal(url.protocol, 'wss:')
    assert.equal(url.host, 'example.gremlin.cosmos.azure.com')
})

// Already gremlin form
test('validateGremlinEndpoint preserves already gremlin cosmos endpoint', () => {
    const ws = validateGremlinEndpoint('https://example.gremlin.cosmos.azure.com:443/')
    assert.equal(new URL(ws).host, 'example.gremlin.cosmos.azure.com')
})

// Empty / whitespace
test('validateGremlinEndpoint rejects empty endpoint', () => {
    assert.throws(() => validateGremlinEndpoint('   '), /empty after trim/i)
})

// Missing scheme
test('validateGremlinEndpoint rejects missing scheme', () => {
    assert.throws(() => validateGremlinEndpoint('example.documents.azure.com:443/'), /must start with https:\/\//i)
})

// Unexpected host
test('validateGremlinEndpoint rejects unexpected host patterns', () => {
    assert.throws(() => validateGremlinEndpoint('https://example.other.azure.com'), /Unexpected Cosmos endpoint format/i)
})
