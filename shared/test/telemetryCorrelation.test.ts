import assert from 'node:assert'
import test from 'node:test'
import {telemetryClient, trackGameEventStrict} from '../src/telemetry.js'

// Basic unit test ensuring correlationId propagates into customDimensions (properties) for emitted events.

test('trackGameEventStrict includes correlationId when provided', () => {
    const events: Array<{name: string; properties?: Record<string, unknown>}> = []
    const original = telemetryClient?.trackEvent
    if (telemetryClient) {
        // Override for capture (SDK method is mutable in tests)
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        telemetryClient.trackEvent = (data: {name: string; properties?: Record<string, unknown>}) => {
            events.push({name: data.name, properties: data.properties})
        }
    }

    const corr = 'corr-test-123'
    trackGameEventStrict('Location.Get', {id: 'location-1', status: 200}, {correlationId: corr})

    // restore
    if (telemetryClient && original) telemetryClient.trackEvent = original

    assert.ok(events.length >= 1, 'No events captured')
    const evt = events.find((e) => e.name === 'Location.Get')
    assert.ok(evt, 'Location.Get event not captured')
    assert.equal(evt?.properties?.correlationId, corr, 'Correlation ID not propagated')
})
