import type { HttpRequest, InvocationContext } from '@azure/functions'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { MoveHandler } from '../../src/handlers/moveCore.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import { makeMoveRequest } from '../helpers/testUtils.js'

describe('PerformMove Telemetry Integration', () => {
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

    test('telemetry emitted for ambiguous relative direction', async () => {
        const ctx = await createMockContext(fixture)
        const telemetry = await fixture.getTelemetryClient()

        const req = makeMoveRequest({ dir: 'forward' }) as HttpRequest

        const container = await fixture.getContainer()
        const handler = container.get(MoveHandler)
        await handler.handle(req, ctx)
        const result = await handler.performMove(req)

        assert.equal(result.error?.type, 'ambiguous')
        if ('events' in telemetry) {
            const navEvent = telemetry.events.find((e) => e.name === 'Navigation.Input.Ambiguous')
            assert.ok(navEvent, 'Navigation.Input.Ambiguous event missing')
            assert.equal(navEvent?.properties?.from, 'a4d1c3f1-5b2a-4f7d-9d4b-8f0c2a6b7e21') // STARTER_LOCATION_ID
            assert.equal(navEvent?.properties?.reason, 'no-heading')
        }
    })

    test('telemetry emitted for successful movement (Navigation.Move.Success status=200)', async () => {
        const ctx = await createMockContext(fixture)
        const telemetry = await fixture.getTelemetryClient()

        const repo = await fixture.getLocationRepository()
        // Two locations with an exit north from A to B
        const fromId = '00000000-0000-0000-0000-000000000001'
        const toId = '00000000-0000-0000-0000-000000000002'
        await repo.upsert({ id: fromId, name: 'Alpha', description: 'Start', exits: [{ direction: 'north', to: toId }] })
        await repo.upsert({ id: toId, name: 'Beta', description: 'Destination', exits: [] })

        const req = makeMoveRequest({ dir: 'north', from: fromId }) as HttpRequest

        const container = await fixture.getContainer()
        const handler = container.get(MoveHandler)
        await handler.handle(req, ctx)
        const result = await handler.performMove(req)

        assert.equal(result.success, true)
        if ('events' in telemetry) {
            const successEvent = telemetry.events.find((e) => e.name === 'Navigation.Move.Success')
            assert.ok(successEvent, 'Navigation.Move.Success event missing')
            assert.equal(successEvent?.properties?.from, fromId)
            assert.equal(successEvent?.properties?.to, toId)
            assert.equal(successEvent?.properties?.direction, 'north')
            assert.equal(successEvent?.properties?.status, 200)
        }
    })

    test('telemetry emitted for blocked movement (Navigation.Move.Blocked invalid direction)', async () => {
        const ctx = await createMockContext(fixture)
        const telemetry = await fixture.getTelemetryClient()

        const repo = await fixture.getLocationRepository()
        const fromId = '00000000-0000-0000-0000-000000000003'
        await repo.upsert({ id: fromId, name: 'Gamma', description: 'Start', exits: [] })

        // invalid direction token
        const req = makeMoveRequest({ dir: 'norrrth', from: fromId }) as HttpRequest
        const container = await fixture.getContainer()
        const handler = container.get(MoveHandler)
        await handler.handle(req, ctx)
        const result = await handler.performMove(req)
        assert.equal(result.success, false)
        assert.equal(result.error?.type, 'invalid-direction')
        if ('events' in telemetry) {
            const blockedEvent = telemetry.events.find(
                (e) => e.name === 'Navigation.Move.Blocked' && e.properties?.reason === 'invalid-direction'
            )
            assert.ok(blockedEvent, 'Navigation.Move.Blocked event missing for invalid direction')
            assert.equal(blockedEvent?.properties?.from, fromId)
            assert.equal(blockedEvent?.properties?.status, 400)
        }
    })
})
