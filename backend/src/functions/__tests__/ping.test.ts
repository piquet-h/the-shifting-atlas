import {SERVICE_BACKEND} from '@atlas/shared'
import type {HttpRequest, InvocationContext} from '@azure/functions'
import assert from 'node:assert'
import {ping} from '../ping.js'

// Minimal HttpRequest/InvocationContext stubs
interface MinimalHttpRequest {
    method: string
    url: string
    headers: Map<string, string>
    query: Map<string, string>
    body?: string
    text(): Promise<string>
}

class TestHttpRequest implements MinimalHttpRequest {
    method = 'GET'
    url = 'http://localhost/ping'
    headers = new Map<string, string>()
    query = new Map<string, string>()
    body?: string
    async text(): Promise<string> {
        return this.body ?? ''
    }
}

const context: InvocationContext = {invocationId: 'test-invocation'} as InvocationContext

;(async () => {
    const req = new TestHttpRequest()
    req.query.set('name', 'tester')
    const res = await ping(req as unknown as HttpRequest, context)
    assert.equal(res.status, 200, 'status should be 200')
    assert.ok(res.jsonBody.ok, 'ok should be true')
    assert.equal(res.jsonBody.echo, 'tester')
    assert.equal(res.jsonBody.service, SERVICE_BACKEND)
    assert.match(res.jsonBody.timestamp, /T/)
})()
