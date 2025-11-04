import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { telemetryClient, trackGameEvent, trackGameEventStrict } from '../../src/telemetry.js'
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

    test('trackGameEvent generates correlationId when not provided', async () => {
        const mockTelemetry = await fixture.getTelemetryClient()
        const originalTrackEvent = telemetryClient.trackEvent
        telemetryClient.trackEvent = mockTelemetry.trackEvent.bind(mockTelemetry)

        try {
            trackGameEvent('Test.Event.GeneratedCorrelation', {})
            const evt = mockTelemetry.events.find((e) => e.name === 'Test.Event.GeneratedCorrelation')
            assert.ok(evt, 'Generated correlation event missing')
            const cid = evt?.properties?.correlationId as string | undefined
            assert.ok(cid, 'correlationId should be present')
            assert.match(cid!, /^[0-9a-fA-F-]{20,}$/)
        } finally {
            telemetryClient.trackEvent = originalTrackEvent
        }
    })

    test('trackGameEvent does not overwrite explicit correlationId property', async () => {
        const mockTelemetry = await fixture.getTelemetryClient()
        const originalTrackEvent = telemetryClient.trackEvent
        telemetryClient.trackEvent = mockTelemetry.trackEvent.bind(mockTelemetry)

        try {
            trackGameEvent('Test.Event.NoOverwrite', { correlationId: 'pre-set' })
            const evt = mockTelemetry.events.find((e) => e.name === 'Test.Event.NoOverwrite')
            assert.ok(evt, 'NoOverwrite event missing')
            assert.equal(evt?.properties?.correlationId, 'pre-set')
        } finally {
            telemetryClient.trackEvent = originalTrackEvent
        }
    })
})
