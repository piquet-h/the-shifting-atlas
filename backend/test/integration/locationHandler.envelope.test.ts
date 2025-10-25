import { STARTER_LOCATION_ID } from '@piquet-h/shared'
/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert'
import { test } from 'node:test'
import { getLocationHandler } from '../../src/functions/location.handler.js'
import { makeLocationRequest } from '../helpers/testUtils.js'

test('getLocationHandler returns ok envelope for starter location', async () => {
    const req = makeLocationRequest(STARTER_LOCATION_ID)
    const res = await getLocationHandler(req)
    assert.equal(res.status, 200)
    const body: any = res.jsonBody
    assert.equal(body.success, true)
    assert.ok(body.data)
    assert.equal(body.data.id, STARTER_LOCATION_ID)
})

test('getLocationHandler returns err envelope for missing location', async () => {
    const req = makeLocationRequest('non-existent-location-id')
    const res = await getLocationHandler(req)
    assert.equal(res.status, 404)
    const body: any = res.jsonBody
    assert.equal(body.success, false)
    assert.equal(body.error.code, 'NotFound')
})
