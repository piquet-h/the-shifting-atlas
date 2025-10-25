import assert from 'node:assert'
import test from 'node:test'
import { telemetryClient, trackGameEventStrict } from '../../src/telemetry.js'
import { mockTelemetry } from '../helpers/testUtils.js'

test('trackGameEventStrict includes correlationId when provided', async () => {
    const { getEvents, restore } = mockTelemetry(telemetryClient)
    try {
        const corr = 'corr-test-123'
        trackGameEventStrict('Location.Get', { id: 'location-1', status: 200 }, { correlationId: corr })

        const events = getEvents()
        assert.ok(events.length >= 1, 'No events captured')
        const evt = events.find((e) => e.name === 'Location.Get')
        assert.ok(evt, 'Location.Get event not captured')
        assert.equal(evt?.properties?.correlationId, corr, 'Correlation ID not propagated')
    } finally {
        restore()
    }
})
