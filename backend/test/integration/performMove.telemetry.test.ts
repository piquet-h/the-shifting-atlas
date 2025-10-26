import type { HttpRequest, InvocationContext } from '@azure/functions'
import assert from 'node:assert'
import { test } from 'node:test'
import { performMove } from '../../src/functions/moveHandlerCore.js'
import { telemetryClient } from '../../src/telemetry.js'
import { getLocationRepositoryForTest, getTestContainer } from '../helpers/testContainer.js'
import { makeMoveRequest, mockTelemetry } from '../helpers/testUtils.js'

/** Helper to create a mock InvocationContext with container */
async function makeMockContext(): Promise<InvocationContext> {
    const container = await getTestContainer('memory')
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
    const ctx = await makeMockContext()
    const { getEvents, restore } = mockTelemetry(telemetryClient)
    try {
        const req = makeMoveRequest({ dir: 'forward' }) as HttpRequest
        const result = await performMove(req, ctx)
        assert.equal(result.error?.type, 'ambiguous')
        const events = getEvents()
        const navEvent = events.find((e) => e.name === 'Navigation.Input.Ambiguous')
        assert.ok(navEvent, 'Navigation.Input.Ambiguous event missing')
        assert.equal(navEvent?.properties?.from, 'a4d1c3f1-5b2a-4f7d-9d4b-8f0c2a6b7e21') // STARTER_LOCATION_ID
        assert.equal(navEvent?.properties?.reason, 'no-heading')
    } finally {
        restore()
    }
})

test('telemetry emitted for successful movement (Location.Move status=200)', async () => {
    const ctx = await makeMockContext()
    const { getEvents, restore } = mockTelemetry(telemetryClient)
    try {
        // Reset repo to ensure fresh in-memory state

        const repo = await getLocationRepositoryForTest()
        // Two locations with an exit north from A to B
        const fromId = '00000000-0000-0000-0000-000000000001'
        const toId = '00000000-0000-0000-0000-000000000002'
        await repo.upsert({ id: fromId, name: 'Alpha', description: 'Start', exits: [{ direction: 'north', to: toId }] })
        await repo.upsert({ id: toId, name: 'Beta', description: 'Destination', exits: [] })
        const req = makeMoveRequest({ dir: 'north', from: fromId }) as HttpRequest
        const result = await performMove(req, ctx)
        assert.equal(result.success, true)
        const events = getEvents()
        const moveEvents = events.filter((e) => e.name === 'Location.Move')
        const successEvent = moveEvents.find((e) => e.properties?.status === 200)
        assert.ok(successEvent, 'Location.Move success event missing')
        assert.equal(successEvent?.properties?.from, fromId)
        assert.equal(successEvent?.properties?.to, toId)
        assert.equal(successEvent?.properties?.direction, 'north')
        assert.equal(successEvent?.properties?.status, 200)
    } finally {
        restore()
    }
})
