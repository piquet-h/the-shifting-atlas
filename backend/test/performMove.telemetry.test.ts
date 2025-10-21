import assert from 'node:assert'
import { test } from 'node:test'
import { performMove } from '../src/functions/moveHandlerCore.js'
import { __resetLocationRepositoryForTests, getLocationRepository } from '../src/repos/locationRepository.js'
import { telemetryClient } from '../src/telemetry.js'

function makeReq(query: Record<string, string>, headers?: Record<string, string>): any {
    return {
        method: 'GET',
        url: 'http://localhost/api/player/move',
        query: { get: (k: string) => query[k] || null },
        headers: { get: (name: string) => headers?.[name] || null }
    }
}

test('telemetry emitted for ambiguous relative direction', async () => {
    const events: Array<{ name: string; properties?: Record<string, unknown> }> = []
    const original = telemetryClient.trackEvent
    ;(telemetryClient as any).trackEvent = (payload: any) => events.push(payload)
    try {
        const req = makeReq({ dir: 'forward' })
        const result = await performMove(req)
        assert.equal(result.error?.type, 'ambiguous')
        const navEvent = events.find((e) => e.name === 'Navigation.Input.Ambiguous')
        assert.ok(navEvent, 'Navigation.Input.Ambiguous event missing')
        assert.equal(navEvent?.properties?.from, 'a4d1c3f1-5b2a-4f7d-9d4b-8f0c2a6b7e21') // STARTER_LOCATION_ID
        assert.equal(navEvent?.properties?.reason, 'no-heading')
    } finally {
        ;(telemetryClient as any).trackEvent = original
    }
})

test('telemetry emitted for successful movement (Location.Move status=200)', async () => {
    const events: Array<{ name: string; properties?: Record<string, unknown> }> = []
    const original = telemetryClient.trackEvent
    ;(telemetryClient as any).trackEvent = (payload: any) => events.push(payload)
    try {
        // Reset repo to ensure fresh in-memory state
        __resetLocationRepositoryForTests()
        const repo = await getLocationRepository()
        // Two locations with an exit north from A to B
        const fromId = '00000000-0000-0000-0000-000000000001'
        const toId = '00000000-0000-0000-0000-000000000002'
        await repo.upsert({ id: fromId, name: 'Alpha', description: 'Start', exits: [{ direction: 'north', to: toId }] })
        await repo.upsert({ id: toId, name: 'Beta', description: 'Destination', exits: [] })
        const req = makeReq({ dir: 'north', from: fromId })
        const result = await performMove(req)
        assert.equal(result.success, true)
        const moveEvents = events.filter((e) => e.name === 'Location.Move')
        const successEvent = moveEvents.find((e) => e.properties?.status === 200)
        assert.ok(successEvent, 'Location.Move success event missing')
        assert.equal(successEvent?.properties?.from, fromId)
        assert.equal(successEvent?.properties?.to, toId)
        assert.equal(successEvent?.properties?.direction, 'north')
        assert.equal(successEvent?.properties?.status, 200)
    } finally {
        ;(telemetryClient as any).trackEvent = original
    }
})
