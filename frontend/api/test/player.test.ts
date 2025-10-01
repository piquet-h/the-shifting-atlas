import type { HttpRequest, InvocationContext } from '@azure/functions'
import assert from 'node:assert'
import { test } from 'node:test'
import { playerHandler } from '../src/functions/player.js'

function makeReq(): HttpRequest {
    return { headers: new Map(), query: { get: () => undefined } } as unknown as HttpRequest
}

function makeContext(): InvocationContext {
    return { log: () => undefined } as unknown as InvocationContext
}

test('/api/player returns playerGuid and currentLocationId', async () => {
    const res = await playerHandler(makeReq(), makeContext())
    assert.equal(res.status, 200)
    const body = res.jsonBody as { playerGuid: string; created: boolean; currentLocationId?: string }
    assert.ok(body.playerGuid)
    assert.equal(typeof body.playerGuid, 'string')
    assert.ok(body.currentLocationId, 'currentLocationId should be present')
})
