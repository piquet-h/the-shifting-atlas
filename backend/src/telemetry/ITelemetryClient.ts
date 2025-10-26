import type { Contracts } from 'applicationinsights'

/**
 * Telemetry client interface for dependency injection.
 * Abstracts the Application Insights TelemetryClient for better testability.
 */
export interface ITelemetryClient {
    /**
     * Track an event with optional properties
     */
    trackEvent(telemetry: Contracts.EventTelemetry): void

    /**
     * Track an exception with optional properties
     */
    trackException(telemetry: Contracts.ExceptionTelemetry): void

    /**
     * Track a metric
     */
    trackMetric(telemetry: Contracts.MetricTelemetry): void

    /**
     * Track a trace message
     */
    trackTrace(telemetry: Contracts.TraceTelemetry): void

    /**
     * Track a dependency
     */
    trackDependency(telemetry: Contracts.DependencyTelemetry): void

    /**
     * Track a request
     */
    trackRequest(telemetry: Contracts.RequestTelemetry): void

    /**
     * Add a telemetry processor to filter/enrich telemetry
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addTelemetryProcessor(telemetryProcessor: (envelope: Contracts.Envelope, contextObjects?: { [name: string]: any }) => boolean): void

    /**
     * Flush buffered telemetry
     */
    flush(options?: { callback?: (response: string) => void; isAppCrashing?: boolean }): void
}
