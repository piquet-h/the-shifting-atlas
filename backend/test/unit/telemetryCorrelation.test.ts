import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { UnitTestFixture } from '../helpers/UnitTestFixture'

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
        const telemetryService = await fixture.getTelemetryService()

        const corr = 'corr-test-123'
        telemetryService.trackGameEventStrict('Location.Get', { id: 'location-1', status: 200 }, { correlationId: corr })

        const evt = mockTelemetry.events.find((e) => e.name === 'Location.Get')
        assert.ok(evt, 'Location.Get event not captured')
        assert.equal(evt?.properties?.correlationId, corr, 'Correlation ID not propagated')
    })

    test('trackGameEvent generates correlationId when not provided', async () => {
        const mockTelemetry = await fixture.getTelemetryClient()
        const telemetryService = await fixture.getTelemetryService()

        telemetryService.trackGameEvent('Test.Event.GeneratedCorrelation', {})
        const evt = mockTelemetry.events.find((e) => e.name === 'Test.Event.GeneratedCorrelation')
        assert.ok(evt, 'Generated correlation event missing')
        const cid = evt?.properties?.correlationId as string | undefined
        assert.ok(cid, 'correlationId should be present')
        // UUID v4 format: 8-4-4-4-12 hex digits
        assert.match(cid!, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    })

    test('trackGameEvent does not overwrite explicit correlationId property', async () => {
        const mockTelemetry = await fixture.getTelemetryClient()
        const telemetryService = await fixture.getTelemetryService()

        telemetryService.trackGameEvent('Test.Event.NoOverwrite', { correlationId: 'pre-set' })
        const evt = mockTelemetry.events.find((e) => e.name === 'Test.Event.NoOverwrite')
        assert.ok(evt, 'NoOverwrite event missing')
        assert.equal(evt?.properties?.correlationId, 'pre-set')
    })
})
