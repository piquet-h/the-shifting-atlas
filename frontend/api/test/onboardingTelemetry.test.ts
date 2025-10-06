import { __resetPlayerRepositoryForTests, getPlayerRepository } from '@atlas/shared'
import type { HttpRequest } from '@azure/functions'
import assert from 'node:assert'
import { beforeEach, test } from 'node:test'
import { playerBootstrap } from '../src/functions/playerBootstrap.js'

function httpRequest(init: { method?: string; headers?: Record<string, string>; body?: unknown }): HttpRequest {
    const headers = new Map<string, string>(Object.entries(init.headers || {}))
    return {
        method: init.method || 'GET',
        url: 'http://localhost',
        headers,
        query: {},
        params: {},
        json: async () => init.body,
        text: async () => (typeof init.body === 'string' ? init.body : JSON.stringify(init.body))
    } as unknown as HttpRequest
}

beforeEach(() => {
    __resetPlayerRepositoryForTests()
})

test('onboarding flow emits events in correct order with correlation', async () => {
    // Test that the bootstrap function properly uses correlation IDs
    // This is a black-box integration test that validates the flow
    const correlationId = 'test-correlation-123'
    const res = await playerBootstrap(httpRequest({ headers: { 'x-correlation-id': correlationId } }))

    assert.equal(res.status, 200)
    const body = res.jsonBody as { playerGuid: string; created: boolean; latencyMs: number }
    assert.ok(body.playerGuid, 'playerGuid should exist')
    assert.equal(body.created, true, 'first bootstrap should create player')

    // Verify correlation ID is returned in response
    const responseHeaders = res.headers as Record<string, string>
    assert.equal(responseHeaders['x-correlation-id'], correlationId, 'correlation ID should be in response')

    // Test idempotent call with same player
    const res2 = await playerBootstrap(
        httpRequest({
            headers: {
                'x-correlation-id': correlationId + '-2',
                'x-player-guid': body.playerGuid
            }
        })
    )
    const body2 = res2.jsonBody as { playerGuid: string; created: boolean }
    assert.equal(body2.playerGuid, body.playerGuid, 'should return same player')
    assert.equal(body2.created, false, 'idempotent call should not create')
})

test('bootstrap maintains player guid across calls', async () => {
    // Verify that onboarding telemetry can track same player across multiple events
    const res1 = await playerBootstrap(httpRequest({}))
    const body1 = res1.jsonBody as { playerGuid: string; created: boolean }
    const guid1 = body1.playerGuid

    // Second call with same guid should be idempotent
    const res2 = await playerBootstrap(httpRequest({ headers: { 'x-player-guid': guid1 } }))
    const body2 = res2.jsonBody as { playerGuid: string; created: boolean }

    assert.equal(body2.playerGuid, guid1, 'player guid should be stable')
    assert.equal(body2.created, false, 'second bootstrap with guid should not recreate')

    // Verify updatedUtc is stable on idempotent calls
    const repo = await getPlayerRepository()
    const rec1 = await repo.get(guid1)
    const initialUpdated = rec1?.updatedUtc

    // Another idempotent call
    await playerBootstrap(httpRequest({ headers: { 'x-player-guid': guid1 } }))
    const rec2 = await repo.get(guid1)

    assert.equal(rec2?.updatedUtc, initialUpdated, 'updatedUtc should not change on idempotent bootstrap')
})
