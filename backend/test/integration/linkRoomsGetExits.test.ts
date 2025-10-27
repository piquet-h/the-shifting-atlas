/* eslint-disable @typescript-eslint/no-explicit-any */
import type { InvocationContext } from '@azure/functions'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { getExitsHandler } from '../../src/handlers/getExits.js'
import { linkRoomsHandler } from '../../src/handlers/linkRooms.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import { TestMocks } from '../helpers/TestFixture.js'

describe('Link Rooms and Get Exits', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    /** Helper to create a mock InvocationContext with container */
    async function createMockContext(fixture: IntegrationTestFixture): Promise<InvocationContext> {
        const container = await fixture.getContainer()
        return {
            invocationId: 'test-invocation',
            functionName: 'test-function',
            extraInputs: new Map([['container', container]]),
            log: () => {},
            error: () => {},
            warn: () => {},
            info: () => {},
            debug: () => {},
            trace: () => {}
        } as unknown as InvocationContext
    }

    /** Helper to create a mock HttpRequest with JSON body */
    function makePostRequest(body: Record<string, unknown>): any {
        return TestMocks.createHttpRequest({
            method: 'POST',
            url: 'http://localhost/api/location/link-rooms',
            body
        })
    }

    /** Helper to create a mock HttpRequest for GET with query params */
    function makeGetRequest(queryParams: Record<string, string>): any {
        return TestMocks.createHttpRequest({
            method: 'GET',
            url: 'http://localhost/api/location/exits',
            query: queryParams
        })
    }

    describe('HttpLinkRooms', () => {
        test('missing originId returns 400', async () => {
            const ctx = await createMockContext(fixture)
            const req = makePostRequest({ destId: 'B', dir: 'north' })
            const res = await linkRoomsHandler(req, ctx)
            assert.equal(res.status, 400)
            const body: any = res.jsonBody
            assert.equal(body.success, false)
            assert.equal(body.error.code, 'MissingOriginId')
        })

        test('missing destId returns 400', async () => {
            const ctx = await createMockContext(fixture)
            const req = makePostRequest({ originId: 'A', dir: 'north' })
            const res = await linkRoomsHandler(req, ctx)
            assert.equal(res.status, 400)
            const body: any = res.jsonBody
            assert.equal(body.success, false)
            assert.equal(body.error.code, 'MissingDestId')
        })

        test('invalid direction returns 400', async () => {
            const ctx = await createMockContext(fixture)
            const req = makePostRequest({ originId: 'A', destId: 'B', dir: 'invalid-direction' })
            const res = await linkRoomsHandler(req, ctx)
            assert.equal(res.status, 400)
            const body: any = res.jsonBody
            assert.equal(body.success, false)
            assert.equal(body.error.code, 'InvalidDirection')
        })

        test('valid request creates exit and returns created=true', async () => {
            const ctx = await createMockContext(fixture)
            // Use existing seed locations (these exist in villageLocations.json)
            const id1 = 'f7c9b2ad-1e34-4c6f-8d5a-2b7e9c4f1a53' // North Road
            const id2 = 'd0b2a7ea-9f4c-41d5-9b2d-7b4a0e6f1c3a' // North Gate

            // Link them via handler with a new direction (northwest - should not exist in seed data between these two)
            const req = makePostRequest({ originId: id1, destId: id2, dir: 'northwest' })
            const res = await linkRoomsHandler(req, ctx)
            assert.equal(res.status, 200)
            const body: any = res.jsonBody
            assert.equal(body.success, true)
            assert.equal(body.data.created, true, `Expected created=true but got ${body.data.created}`)
        })

        test('idempotent request returns created=false', async () => {
            const ctx = await createMockContext(fixture)
            // Use existing seed locations
            const id1 = '5a6b2d1c-4e8f-4ad3-9c1b-7d9e3f2b6c41' // Market Row
            const id2 = '9c4b1f2e-5d6a-4e3b-8a7c-1d2f3e4a5b6c' // Tavern

            // First call - should create
            const req1 = makePostRequest({ originId: id1, destId: id2, dir: 'west' })
            await linkRoomsHandler(req1, ctx)

            // Second call with same parameters - should return created=false
            const req2 = makePostRequest({ originId: id1, destId: id2, dir: 'west' })
            const res = await linkRoomsHandler(req2, ctx)
            assert.equal(res.status, 200)
            const body: any = res.jsonBody
            assert.equal(body.success, true)
            assert.equal(body.data.created, false)
        })

        test('reciprocal flag creates both directions', async () => {
            const ctx = await createMockContext(fixture)
            // Use existing seed locations
            const id1 = '2f1d7c9e-3b4a-45d8-9e6f-7a1c2b3d4e5f' // Smithy
            const id2 = '4c3b2a1f-0e9d-48c7-b6a5-5d4e3f2a1b0c' // Cottages

            const req = makePostRequest({ originId: id1, destId: id2, dir: 'southwest', reciprocal: true })
            const res = await linkRoomsHandler(req, ctx)
            assert.equal(res.status, 200)
            const body: any = res.jsonBody
            assert.equal(body.success, true)
            assert.equal(body.data.created, true)
            assert.equal(body.data.reciprocalCreated, true)
        })
    })

    describe('HttpGetExits', () => {
        test('missing locationId returns 400', async () => {
            const ctx = await createMockContext(fixture)
            const req = makeGetRequest({})
            const res = await getExitsHandler(req, ctx)
            assert.equal(res.status, 400)
            const body: any = res.jsonBody
            assert.equal(body.success, false)
            assert.equal(body.error.code, 'MissingLocationId')
        })

        test('valid request returns exits array', async () => {
            const ctx = await createMockContext(fixture)
            const req = makeGetRequest({ locationId: 'test-loc-7' })
            const res = await getExitsHandler(req, ctx)
            assert.equal(res.status, 200)
            const body: any = res.jsonBody
            assert.equal(body.success, true)
            assert.ok(Array.isArray(body.data.exits))
        })
    })
})
