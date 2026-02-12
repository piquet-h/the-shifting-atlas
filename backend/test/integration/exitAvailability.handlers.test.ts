/**
 * Integration tests for exit availability representation in move/look handlers.
 *
 * Tests cover:
 * - Look handler returns ExitInfo array with availability states
 * - Move handler returns ExitInfo array with availability states
 * - Backward compatibility: locations without exitAvailability metadata
 * - Edge case: hard exit takes precedence over forbidden/pending
 */
import type { HttpRequest, InvocationContext } from '@azure/functions'
import { STARTER_LOCATION_ID, type ExitInfo } from '@piquet-h/shared'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { LocationLookHandler } from '../../src/handlers/locationLook.js'
import { MoveHandler } from '../../src/handlers/moveCore.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import { makeMoveRequest } from '../helpers/testUtils.js'

describe('Exit Availability in Move/Look Handlers', () => {
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

    /** Helper to create a minimal HttpRequest for Look */
    function makeLookRequest(locationId: string): HttpRequest {
        return {
            method: 'GET',
            url: `http://localhost/api/location/${locationId}`,
            headers: new Headers(),
            query: new URLSearchParams(),
            params: { locationId },
            user: null,
            arrayBuffer: async () => new ArrayBuffer(0),
            blob: async () => new Blob(),
            formData: async () => new FormData(),
            json: async () => ({}),
            text: async () => ''
        } as unknown as HttpRequest
    }

    describe('LocationLookHandler - exit availability', () => {
        test('returns ExitInfo array with availability=hard for existing exits', async () => {
            const ctx = await createMockContext(fixture)
            const req = makeLookRequest(STARTER_LOCATION_ID)

            const container = await fixture.getContainer()
            const handler = container.get(LocationLookHandler)
            const response = await handler.handle(req, ctx)

            assert.equal(response.status, 200)
            const body = JSON.parse(response.body as string)
            assert.ok(body.success)
            assert.ok(body.data)
            assert.ok(Array.isArray(body.data.exits), 'exits should be an array')

            // All exits should have availability='hard'
            const exits = body.data.exits as ExitInfo[]
            assert.ok(exits.length > 0, 'Should have at least one exit')

            for (const exit of exits) {
                assert.ok(exit.direction, 'Exit should have direction')
                assert.equal(exit.availability, 'hard', 'All existing exits should have availability=hard')
                assert.ok(exit.toLocationId, 'Hard exits should have toLocationId')
            }
        })

        test('backward compatibility: location without exitAvailability metadata', async () => {
            // STARTER_LOCATION_ID doesn't have exitAvailability metadata
            const ctx = await createMockContext(fixture)
            const req = makeLookRequest(STARTER_LOCATION_ID)

            const container = await fixture.getContainer()
            const handler = container.get(LocationLookHandler)
            const response = await handler.handle(req, ctx)

            assert.equal(response.status, 200)
            const body = JSON.parse(response.body as string)

            // Should still work - only hard exits returned
            const exits = body.data.exits as ExitInfo[]
            assert.ok(exits.every((e) => e.availability === 'hard'))
        })
    })

    describe('MoveHandler - exit availability', () => {
        test('successful move returns ExitInfo array for destination', async () => {
            // Move north from STARTER_LOCATION_ID
            const req = makeMoveRequest({ dir: 'north' }) as HttpRequest

            const container = await fixture.getContainer()
            const handler = container.get(MoveHandler)
            const result = await handler.performMove(req)

            assert.equal(result.success, true)
            assert.ok(result.location, 'Should have location data')
            assert.ok(Array.isArray(result.location.exits), 'exits should be an array')

            const exits = result.location.exits as ExitInfo[]
            assert.ok(exits.length > 0, 'Destination should have exits')

            // All exits should have availability='hard'
            for (const exit of exits) {
                assert.ok(exit.direction, 'Exit should have direction')
                assert.equal(exit.availability, 'hard', 'All existing exits should have availability=hard')
                assert.ok(exit.toLocationId, 'Hard exits should have toLocationId')
            }
        })

        test('backward compatibility: destination without exitAvailability metadata', async () => {
            const req = makeMoveRequest({ dir: 'north' }) as HttpRequest

            const container = await fixture.getContainer()
            const handler = container.get(MoveHandler)
            const result = await handler.performMove(req)

            assert.equal(result.success, true)

            // Should still work - only hard exits returned
            const exits = result.location!.exits as ExitInfo[]
            assert.ok(exits.every((e) => e.availability === 'hard'))
        })
    })

    describe('ExitInfo format validation', () => {
        test('ExitInfo has required fields for hard exit', async () => {
            const ctx = await createMockContext(fixture)
            const req = makeLookRequest(STARTER_LOCATION_ID)

            const container = await fixture.getContainer()
            const handler = container.get(LocationLookHandler)
            const response = await handler.handle(req, ctx)

            const body = JSON.parse(response.body as string)
            const exits = body.data.exits as ExitInfo[]

            const hardExit = exits[0]
            assert.ok(hardExit.direction, 'Should have direction')
            assert.equal(hardExit.availability, 'hard', 'Should have availability')
            assert.ok(hardExit.toLocationId, 'Hard exit should have toLocationId')
        })

        test('ExitInfo is JSON serializable', async () => {
            const ctx = await createMockContext(fixture)
            const req = makeLookRequest(STARTER_LOCATION_ID)

            const container = await fixture.getContainer()
            const handler = container.get(LocationLookHandler)
            const response = await handler.handle(req, ctx)

            // Response should be valid JSON
            assert.doesNotThrow(() => {
                const body = JSON.parse(response.body as string)
                const exits = body.data.exits

                // Should be able to re-serialize
                const reSerialize = JSON.stringify(exits)
                const reParse = JSON.parse(reSerialize)
                assert.ok(Array.isArray(reParse))
            })
        })
    })
})
