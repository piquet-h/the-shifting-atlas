import type {HttpRequest} from '@azure/functions'
import assert from 'node:assert'
import {test} from 'node:test'
import {getRoomHandler, moveHandler} from '../src/functions/room.js'

// Minimal mock request object
function makeReq(query: Record<string, string> = {}): HttpRequest {
    return {query: {get: (k: string) => query[k]}} as unknown as HttpRequest
}

test('room get returns starter room by default', async () => {
    const res = await getRoomHandler(makeReq())
    assert.equal(res.status, 200)
    assert.ok(res.jsonBody.id)
    assert.equal(res.jsonBody.id, 'starter-room')
    assert.ok(res.jsonBody.description)
})

test('room move north goes to antechamber', async () => {
    const res = await moveHandler(makeReq({from: 'starter-room', dir: 'north'}))
    assert.equal(res.status, 200)
    assert.equal(res.jsonBody.id, 'antechamber')
})

test('room move invalid direction errors', async () => {
    const res = await moveHandler(makeReq({from: 'starter-room', dir: 'west'}))
    assert.equal(res.status, 400)
})

test('room move south returns atrium', async () => {
    // first move north
    const north = await moveHandler(makeReq({from: 'starter-room', dir: 'north'}))
    assert.equal(north.status, 200)
    // then move south from antechamber
    const south = await moveHandler(makeReq({from: 'antechamber', dir: 'south'}))
    assert.equal(south.status, 200)
    assert.equal(south.jsonBody.id, 'starter-room')
})
