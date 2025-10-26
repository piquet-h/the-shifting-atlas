import type { Contracts } from 'applicationinsights'
import { injectable } from 'inversify'
import { ITelemetryClient } from '../../src/telemetry/ITelemetryClient.js'

/**
 * Mock implementation of ITelemetryClient for unit tests.
 * Stores tracked telemetry for verification in tests.
 */
@injectable()
export class MockTelemetryClient implements ITelemetryClient {
    public events: Contracts.EventTelemetry[] = []
    public exceptions: Contracts.ExceptionTelemetry[] = []
    public metrics: Contracts.MetricTelemetry[] = []
    public traces: Contracts.TraceTelemetry[] = []
    public dependencies: Contracts.DependencyTelemetry[] = []
    public requests: Contracts.RequestTelemetry[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private processors: Array<(envelope: Contracts.Envelope, contextObjects?: { [name: string]: any }) => boolean> = []

    trackEvent(telemetry: Contracts.EventTelemetry): void {
        this.events.push(telemetry)
    }

    trackException(telemetry: Contracts.ExceptionTelemetry): void {
        this.exceptions.push(telemetry)
    }

    trackMetric(telemetry: Contracts.MetricTelemetry): void {
        this.metrics.push(telemetry)
    }

    trackTrace(telemetry: Contracts.TraceTelemetry): void {
        this.traces.push(telemetry)
    }

    trackDependency(telemetry: Contracts.DependencyTelemetry): void {
        this.dependencies.push(telemetry)
    }

    trackRequest(telemetry: Contracts.RequestTelemetry): void {
        this.requests.push(telemetry)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addTelemetryProcessor(telemetryProcessor: (envelope: Contracts.Envelope, contextObjects?: { [name: string]: any }) => boolean): void {
        this.processors.push(telemetryProcessor)
    }

    flush(): void {
        // No-op in mock
    }

    // Test helpers
    clear(): void {
        this.events = []
        this.exceptions = []
        this.metrics = []
        this.traces = []
        this.dependencies = []
        this.requests = []
        this.processors = []
    }

    getEventCount(): number {
        return this.events.length
    }

    getExceptionCount(): number {
        return this.exceptions.length
    }
}
