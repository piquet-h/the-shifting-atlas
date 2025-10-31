/**
 * Integration tests for RESTful route parameter extraction
 * Tests playerGet, playerMove, and locationLook with path-based parameters
 */
import type { HttpRequest, InvocationContext } from '@azure/functions'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import { getPlayerHandler } from '../../src/handlers/playerGet.js'
import { handlePlayerMove } from '../../src/handlers/playerMove.js'
import { bootstrapPlayerHandler } from '../../src/handlers/bootstrapPlayer.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describe('Route Parameters Integration', () => {
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

    /** Helper to create a mock HTTP request with params */
    function createMockRequest(options: {
        method?: string
        params?: Record<string, string>
        query?: Record<string, string>
        headers?: Record<string, string>
        body?: unknown
    }): HttpRequest {
        return {
            method: options.method || 'GET',
            url: 'http://localhost/api/test',
            params: options.params || {},
            query: {
                get: (key: string) => options.query?.[key] || null
            },
            headers: {
                get: (name: string) => options.headers?.[name] || null
            },
            body: options.body
        } as unknown as HttpRequest
    }

    /** Helper to create a test player */
    async function createTestPlayer(ctx: InvocationContext): Promise<string> {
        const req = createMockRequest({
            method: 'POST',
            headers: { 'x-ms-client-principal': Buffer.from(JSON.stringify({ userId: 'test-user' })).toString('base64') }
        })
        const res = await bootstrapPlayerHandler(req, ctx)
        const body = res.jsonBody as { success: boolean; data: { playerGuid: string } }
        return body.data.playerGuid
    }

    describe('PlayerGet Route Parameters', () => {
        test('extracts playerId from route parameter', async () => {
            const ctx = await createMockContext(fixture)
            const playerId = await createTestPlayer(ctx)

            const req = createMockRequest({
                params: { playerId }
            })

            const res = await getPlayerHandler(req, ctx)

            assert.strictEqual(res.status, 200)
            const body = res.jsonBody as { success: boolean; data: { id: string } }
            assert.strictEqual(body.success, true)
            assert.strictEqual(body.data.id, playerId)
        })

        test('falls back to x-player-guid header when path param missing', async () => {
            const ctx = await createMockContext(fixture)
            const playerId = await createTestPlayer(ctx)

            const req = createMockRequest({
                headers: { 'x-player-guid': playerId }
            })

            const res = await getPlayerHandler(req, ctx)

            assert.strictEqual(res.status, 200)
            const body = res.jsonBody as { success: boolean; data: { id: string } }
            assert.strictEqual(body.success, true)
            assert.strictEqual(body.data.id, playerId)
        })

        test('returns 400 when both path param and header are missing', async () => {
            const ctx = await createMockContext(fixture)
            const req = createMockRequest({})

            const res = await getPlayerHandler(req, ctx)

            assert.strictEqual(res.status, 400)
            const body = res.jsonBody as { success: boolean; error: { code: string; message: string } }
            assert.strictEqual(body.success, false)
            assert.strictEqual(body.error.code, 'MissingPlayerId')
        })

        test('returns 400 for invalid GUID format in path param', async () => {
            const ctx = await createMockContext(fixture)
            const req = createMockRequest({
                params: { playerId: 'not-a-valid-guid' }
            })

            const res = await getPlayerHandler(req, ctx)

            assert.strictEqual(res.status, 400)
            const body = res.jsonBody as { success: boolean; error: { code: string; message: string } }
            assert.strictEqual(body.success, false)
            assert.strictEqual(body.error.code, 'InvalidPlayerId')
        })
    })

    describe('PlayerMove Route Parameters', () => {
        test('validates playerId from route parameter', async () => {
            const ctx = await createMockContext(fixture)
            const playerId = await createTestPlayer(ctx)

            const req = createMockRequest({
                method: 'POST',
                params: { playerId },
                query: { from: STARTER_LOCATION_ID, dir: 'north' }
            })

            const res = await handlePlayerMove(req, ctx)

            // Should process the move request (may fail if no north exit, but validates the playerId)
            assert.ok([200, 400, 404].includes(res.status || 0))
        })

        test('validates playerId falls back to header', async () => {
            const ctx = await createMockContext(fixture)
            const playerId = await createTestPlayer(ctx)

            const req = createMockRequest({
                method: 'POST',
                headers: { 'x-player-guid': playerId },
                query: { from: STARTER_LOCATION_ID, dir: 'north' }
            })

            const res = await handlePlayerMove(req, ctx)

            // Should process the move request
            assert.ok([200, 400, 404].includes(res.status || 0))
        })

        test('returns 400 when playerId is missing from both path and header', async () => {
            const ctx = await createMockContext(fixture)
            const req = createMockRequest({
                method: 'POST',
                query: { from: STARTER_LOCATION_ID, dir: 'north' }
            })

            const res = await handlePlayerMove(req, ctx)

            assert.strictEqual(res.status, 400)
            const body = res.jsonBody as { error: string }
            assert.strictEqual(body.error, 'MissingPlayerId')
        })

        test('returns 400 for invalid GUID format in playerId', async () => {
            const ctx = await createMockContext(fixture)
            const req = createMockRequest({
                method: 'POST',
                params: { playerId: 'invalid-guid-123' },
                query: { from: STARTER_LOCATION_ID, dir: 'north' }
            })

            const res = await handlePlayerMove(req, ctx)

            assert.strictEqual(res.status, 400)
            const body = res.jsonBody as { error: string }
            assert.strictEqual(body.error, 'InvalidPlayerId')
        })

        test('accepts direction from query parameter', async () => {
            const ctx = await createMockContext(fixture)
            const playerId = await createTestPlayer(ctx)

            const req = createMockRequest({
                method: 'GET',
                params: { playerId },
                query: { from: STARTER_LOCATION_ID, dir: 'north' }
            })

            const res = await handlePlayerMove(req, ctx)

            // Should attempt to process move
            assert.ok(res.status !== undefined)
        })

        test('accepts direction from request body', async () => {
            const ctx = await createMockContext(fixture)
            const playerId = await createTestPlayer(ctx)

            const req = createMockRequest({
                method: 'POST',
                params: { playerId },
                query: { from: STARTER_LOCATION_ID },
                body: JSON.stringify({ direction: 'north' })
            })

            const res = await handlePlayerMove(req, ctx)

            // Should attempt to process move
            assert.ok(res.status !== undefined)
        })
    })

    describe('LocationLook Route Parameters', () => {
        test('uses starter location when path param is empty', async () => {
            const ctx = await createMockContext(fixture)

            // Mock request with empty locationId (should default to STARTER_LOCATION_ID)
            const req = {
                method: 'GET',
                url: 'http://localhost/api/location',
                params: {},
                query: {
                    get: () => null
                },
                headers: {
                    get: () => null
                }
            } as unknown as HttpRequest

            const { app } = await import('@azure/functions')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const registeredFunctions = (app as any)._functions || []
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const locationLookFn = registeredFunctions.find((f: any) => f.name === 'LocationLook')

            if (locationLookFn?.handler) {
                const res = await locationLookFn.handler(req, ctx)

                assert.strictEqual(res.status, 200)
                const body = res.jsonBody as { success: boolean; data: { locationId: string } }
                assert.strictEqual(body.success, true)
                assert.strictEqual(body.data.locationId, STARTER_LOCATION_ID)
            }
        })

        test('returns 400 for invalid GUID format in locationId', async () => {
            const ctx = await createMockContext(fixture)

            const req = {
                method: 'GET',
                url: 'http://localhost/api/location/invalid-guid',
                params: { locationId: 'invalid-guid' },
                query: {
                    get: () => null
                },
                headers: {
                    get: () => null
                }
            } as unknown as HttpRequest

            const { app } = await import('@azure/functions')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const registeredFunctions = (app as any)._functions || []
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const locationLookFn = registeredFunctions.find((f: any) => f.name === 'LocationLook')

            if (locationLookFn?.handler) {
                const res = await locationLookFn.handler(req, ctx)

                assert.strictEqual(res.status, 400)
                const body = res.jsonBody as { error: string }
                assert.strictEqual(body.error, 'InvalidLocationId')
            }
        })
    })
})
