import type { Contracts } from 'applicationinsights'
import type { ITelemetryClient } from './ITelemetryClient.js'

/**
 * Null implementation of ITelemetryClient for local development.
 * All telemetry operations are no-ops to avoid initialization overhead and network calls.
 */
export class NullTelemetryClient implements ITelemetryClient {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    trackEvent(telemetry: Contracts.EventTelemetry): void {
        // no-op
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    trackException(telemetry: Contracts.ExceptionTelemetry): void {
        // no-op
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    trackMetric(telemetry: Contracts.MetricTelemetry): void {
        // no-op
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    trackTrace(telemetry: Contracts.TraceTelemetry): void {
        // no-op
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    trackDependency(telemetry: Contracts.DependencyTelemetry): void {
        // no-op
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    trackRequest(telemetry: Contracts.RequestTelemetry): void {
        // no-op
    }

    addTelemetryProcessor(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
        telemetryProcessor: (envelope: Contracts.Envelope, contextObjects?: { [name: string]: any }) => boolean
    ): void {
        // no-op
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    flush(options?: { callback?: (response: string) => void; isAppCrashing?: boolean }): void {
        // no-op
    }
}
