import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import appInsights from 'applicationinsights'
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

    describe('correlationId', () => {
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

    describe('operationId', () => {
        test('trackGameEvent attaches operationId when available from Application Insights context', async () => {
            const mockTelemetry = await fixture.getTelemetryClient()
            const originalTrackEvent = telemetryClient.trackEvent
            const originalDefaultClient = appInsights.defaultClient

            try {
                // Mock Application Insights context with operationId
                const mockOperationId = 'mock-operation-id-123'
                const mockClient = {
                    context: {
                        tags: {
                            'ai.operation.id': mockOperationId
                        },
                        keys: {
                            operationId: 'ai.operation.id'
                        }
                    }
                } as unknown as typeof appInsights.defaultClient

                // Replace defaultClient with mock
                Object.defineProperty(appInsights, 'defaultClient', {
                    value: mockClient,
                    writable: true,
                    configurable: true
                })

                telemetryClient.trackEvent = mockTelemetry.trackEvent.bind(mockTelemetry)

                trackGameEvent('Test.Event.WithOperationId', { test: 'value' })

                const evt = mockTelemetry.events.find((e) => e.name === 'Test.Event.WithOperationId')
                assert.ok(evt, 'Event not captured')
                assert.equal(evt?.properties?.operationId, mockOperationId, 'operationId should be attached from context')
                assert.ok(evt?.properties?.correlationId, 'correlationId should also be present')
            } finally {
                telemetryClient.trackEvent = originalTrackEvent
                Object.defineProperty(appInsights, 'defaultClient', {
                    value: originalDefaultClient,
                    writable: true,
                    configurable: true
                })
            }
        })

        test('trackGameEvent omits operationId when Application Insights context unavailable', async () => {
            const mockTelemetry = await fixture.getTelemetryClient()
            const originalTrackEvent = telemetryClient.trackEvent
            const originalDefaultClient = appInsights.defaultClient

            try {
                // Simulate no Application Insights client (test/queue handler scenario)
                Object.defineProperty(appInsights, 'defaultClient', {
                    value: null,
                    writable: true,
                    configurable: true
                })

                telemetryClient.trackEvent = mockTelemetry.trackEvent.bind(mockTelemetry)

                trackGameEvent('Test.Event.NoOperationId', { test: 'value' })

                const evt = mockTelemetry.events.find((e) => e.name === 'Test.Event.NoOperationId')
                assert.ok(evt, 'Event not captured')
                assert.equal(evt?.properties?.operationId, undefined, 'operationId should not be present')
                assert.ok(evt?.properties?.correlationId, 'correlationId should be present even without operationId')
            } finally {
                telemetryClient.trackEvent = originalTrackEvent
                Object.defineProperty(appInsights, 'defaultClient', {
                    value: originalDefaultClient,
                    writable: true,
                    configurable: true
                })
            }
        })

        test('trackGameEventStrict attaches operationId when available', async () => {
            const mockTelemetry = await fixture.getTelemetryClient()
            const originalTrackEvent = telemetryClient.trackEvent
            const originalDefaultClient = appInsights.defaultClient

            try {
                const mockOperationId = 'mock-operation-strict-456'
                const mockClient = {
                    context: {
                        tags: {
                            'ai.operation.id': mockOperationId
                        },
                        keys: {
                            operationId: 'ai.operation.id'
                        }
                    }
                } as unknown as typeof appInsights.defaultClient

                Object.defineProperty(appInsights, 'defaultClient', {
                    value: mockClient,
                    writable: true,
                    configurable: true
                })

                telemetryClient.trackEvent = mockTelemetry.trackEvent.bind(mockTelemetry)

                trackGameEventStrict('Location.Get', { status: 200 })

                const evt = mockTelemetry.events.find((e) => e.name === 'Location.Get')
                assert.ok(evt, 'Event not captured')
                assert.equal(evt?.properties?.operationId, mockOperationId, 'operationId should be attached')
            } finally {
                telemetryClient.trackEvent = originalTrackEvent
                Object.defineProperty(appInsights, 'defaultClient', {
                    value: originalDefaultClient,
                    writable: true,
                    configurable: true
                })
            }
        })

        test('trackGameEvent does not overwrite explicit operationId property', async () => {
            const mockTelemetry = await fixture.getTelemetryClient()
            const originalTrackEvent = telemetryClient.trackEvent
            const originalDefaultClient = appInsights.defaultClient

            try {
                const mockOperationId = 'mock-operation-789'
                const mockClient = {
                    context: {
                        tags: {
                            'ai.operation.id': mockOperationId
                        },
                        keys: {
                            operationId: 'ai.operation.id'
                        }
                    }
                } as unknown as typeof appInsights.defaultClient

                Object.defineProperty(appInsights, 'defaultClient', {
                    value: mockClient,
                    writable: true,
                    configurable: true
                })

                telemetryClient.trackEvent = mockTelemetry.trackEvent.bind(mockTelemetry)

                trackGameEvent('Test.Event.ExplicitOperationId', { operationId: 'explicit-op-id' })

                const evt = mockTelemetry.events.find((e) => e.name === 'Test.Event.ExplicitOperationId')
                assert.ok(evt, 'Event not captured')
                assert.equal(evt?.properties?.operationId, 'explicit-op-id', 'Should preserve explicit operationId')
            } finally {
                telemetryClient.trackEvent = originalTrackEvent
                Object.defineProperty(appInsights, 'defaultClient', {
                    value: originalDefaultClient,
                    writable: true,
                    configurable: true
                })
            }
        })

        test('trackGameEvent handles missing context.tags gracefully', async () => {
            const mockTelemetry = await fixture.getTelemetryClient()
            const originalTrackEvent = telemetryClient.trackEvent
            const originalDefaultClient = appInsights.defaultClient

            try {
                // Mock client with missing tags
                const mockClient = {
                    context: {
                        keys: {
                            operationId: 'ai.operation.id'
                        }
                    }
                } as unknown as typeof appInsights.defaultClient

                Object.defineProperty(appInsights, 'defaultClient', {
                    value: mockClient,
                    writable: true,
                    configurable: true
                })

                telemetryClient.trackEvent = mockTelemetry.trackEvent.bind(mockTelemetry)

                trackGameEvent('Test.Event.MissingTags', {})

                const evt = mockTelemetry.events.find((e) => e.name === 'Test.Event.MissingTags')
                assert.ok(evt, 'Event should be captured')
                assert.equal(evt?.properties?.operationId, undefined, 'operationId should be undefined')
                assert.ok(evt?.properties?.correlationId, 'correlationId should be present')
            } finally {
                telemetryClient.trackEvent = originalTrackEvent
                Object.defineProperty(appInsights, 'defaultClient', {
                    value: originalDefaultClient,
                    writable: true,
                    configurable: true
                })
            }
        })
    })
})
