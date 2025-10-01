import { SECOND_LOCATION_ID, STARTER_LOCATION_ID } from '@atlas/shared'
import type { HttpRequest } from '@azure/functions'
import assert from 'node:assert'
import { test } from 'node:test'
import { getLocationHandler, moveHandler } from '../src/functions/location.js'

function makeReq(query: Record<string, string> = {}): HttpRequest {
    return { query: { get: (k: string) => query[k] } } as unknown as HttpRequest
}

test('location get returns starter location by default', async () => {
    const res = await getLocationHandler(makeReq())
    assert.equal(res.status, 200)
    assert.ok(res.jsonBody.id)
    assert.equal(res.jsonBody.id, STARTER_LOCATION_ID)
    assert.ok(res.jsonBody.description)
})

test('location move north goes to second anchor', async () => {
    const res = await moveHandler(makeReq({ from: STARTER_LOCATION_ID, dir: 'north' }))
    assert.equal(res.status, 200)
    assert.equal(res.jsonBody.id, SECOND_LOCATION_ID)
})

test('location move invalid direction errors', async () => {
    const res = await moveHandler(makeReq({ from: STARTER_LOCATION_ID, dir: 'up' }))
    assert.equal(res.status, 400)
})

test('location move south returns starter', async () => {
    const north = await moveHandler(makeReq({ from: STARTER_LOCATION_ID, dir: 'north' }))
    assert.equal(north.status, 200)
    const south = await moveHandler(makeReq({ from: SECOND_LOCATION_ID, dir: 'south' }))
    assert.equal(south.status, 200)
    assert.equal(south.jsonBody.id, STARTER_LOCATION_ID)
})
