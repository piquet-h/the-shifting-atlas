import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { telemetryClient, trackGameEventStrict } from '../../src/telemetry.js'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'

describe('Telemetry Correlation', () => {
    let fixture: UnitTestFixture

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('trackGameEventStrict includes correlationId when provided', async () => {
        const mockTelemetry = await fixture.getTelemetryClient()
        const originalTrackEvent = telemetryClient.trackEvent
        telemetryClient.trackEvent = mockTelemetry.trackEvent.bind(mockTelemetry)

        try {
            const corr = 'corr-test-123'
            trackGameEventStrict('Location.Get', { id: 'location-1', status: 200 }, { correlationId: corr })

            assert.ok(mockTelemetry.events.length >= 1, 'No events captured')
            const evt = mockTelemetry.events.find((e) => e.name === 'Location.Get')
            assert.ok(evt, 'Location.Get event not captured')
            assert.equal(evt?.properties?.correlationId, corr, 'Correlation ID not propagated')
        } finally {
            telemetryClient.trackEvent = originalTrackEvent
        }
    })
})
