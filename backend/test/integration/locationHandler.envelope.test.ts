import type { InvocationContext } from '@azure/functions'
import { STARTER_LOCATION_ID } from '@piquet-h/shared'
/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert'
import { test } from 'node:test'
import { getLocationHandler } from '../../src/functions/location.handler.js'
import { getTestContainer } from '../helpers/testContainer.js'
import { makeLocationRequest } from '../helpers/testUtils.js'

async function callGetLocation(id?: string) {
    const container = await getTestContainer('memory')
    const mockContext = {
        invocationId: 'test-invocation',
        functionName: 'getLocation',
        extraInputs: new Map([['container', container]]),
        log: () => {},
        error: () => {},
        warn: () => {},
        info: () => {},
        debug: () => {},
        trace: () => {}
    } as unknown as InvocationContext

    return getLocationHandler(makeLocationRequest(id) as any, mockContext)
}

test('getLocationHandler returns ok envelope for starter location', async () => {
    const res = await callGetLocation(STARTER_LOCATION_ID)
    assert.equal(res.status, 200)
    const body: any = res.jsonBody
    assert.equal(body.success, true)
    assert.ok(body.data)
    assert.equal(body.data.id, STARTER_LOCATION_ID)
})

test('getLocationHandler returns err envelope for missing location', async () => {
    const res = await callGetLocation('non-existent-location-id')
    assert.equal(res.status, 404)
    const body: any = res.jsonBody
    assert.equal(body.success, false)
    assert.equal(body.error.code, 'NotFound')
})
