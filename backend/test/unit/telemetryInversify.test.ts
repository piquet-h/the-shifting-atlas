/**
 * Example test demonstrating Inversify-based TelemetryClient mocking
 * This approach is useful when testing services that receive TelemetryClient via DI
 */

import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { ITelemetryClient } from '../../src/telemetry/ITelemetryClient'
import { UnitTestFixture } from '../helpers/UnitTestFixture'
import { createMockTelemetryClient, createTestContainer } from '../helpers/containerHelpers'

describe('Telemetry Inversify Integration', () => {
    let fixture: UnitTestFixture

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('createMockTelemetryClient captures trackEvent calls', () => {
        const { client, getEvents } = createMockTelemetryClient()

        client.trackEvent({ name: 'Test.Event', properties: { foo: 'bar' } })
        client.trackEvent({ name: 'Test.Event2', properties: { baz: 'qux' } })

        const events = getEvents()
        assert.equal(events.length, 2)
        assert.equal(events[0].name, 'Test.Event')
        assert.equal(events[0].properties?.foo, 'bar')
        assert.equal(events[1].name, 'Test.Event2')
    })

    test('createMockTelemetryClient captures trackException calls', () => {
        const { client, getExceptions } = createMockTelemetryClient()

        const error = new Error('Test error')
        client.trackException({ exception: error, properties: { context: 'test' } })

        const exceptions = getExceptions()
        assert.equal(exceptions.length, 1)
        assert.equal(exceptions[0].exception.message, 'Test error')
        assert.equal(exceptions[0].properties?.context, 'test')
    })

    test('createTestContainer binds mock TelemetryClient', () => {
        const { client } = createMockTelemetryClient()
        const container = createTestContainer({ telemetryClient: client })

        const retrievedClient = container.get<ITelemetryClient>('ITelemetryClient')
        assert.strictEqual(retrievedClient, client, 'Should retrieve the same mock client')
    })

    test('complete DI pattern: service with injected TelemetryClient', () => {
        // Example: Testing a hypothetical service that uses TelemetryClient via DI
        class ExampleService {
            constructor(private telemetry: ITelemetryClient) {}

            doWork() {
                this.telemetry.trackEvent({ name: 'ExampleService.Work', properties: { action: 'completed' } })
                return 'done'
            }

            handleError() {
                const err = new Error('Something failed')
                this.telemetry.trackException({ exception: err, properties: { severity: 'high' } })
            }
        }

        // Setup: Create mock and bind to container
        const { client, getEvents, getExceptions } = createMockTelemetryClient()

        // Manually create service instance with injected mock (simulating DI)
        const service = new ExampleService(client)

        // Act: Use the service
        const result = service.doWork()
        service.handleError()

        // Assert: Verify behavior
        assert.equal(result, 'done')

        // Assert: Verify telemetry was captured
        const events = getEvents()
        assert.equal(events.length, 1)
        assert.equal(events[0].name, 'ExampleService.Work')
        assert.equal(events[0].properties?.action, 'completed')

        const exceptions = getExceptions()
        assert.equal(exceptions.length, 1)
        assert.equal(exceptions[0].exception.message, 'Something failed')
        assert.equal(exceptions[0].properties?.severity, 'high')
    })
})
