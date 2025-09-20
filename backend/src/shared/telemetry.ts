/*
 * Application Insights Telemetry Initialization (Azure Functions)
 * Initializes the Application Insights SDK early so automatic collection (requests, dependencies, traces, exceptions)
 * is enabled for all function executions. Uses connection string via env var APPLICATIONINSIGHTS_CONNECTION_STRING.
 */
import appInsights from 'applicationinsights'

// Only initialize once (Functions can hot-reload in watch mode)
if (!appInsights.defaultClient) {
    const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
    if (connectionString) {
        appInsights
            .setup(connectionString)
            .setAutoCollectRequests(true)
            .setAutoCollectDependencies(true)
            .setAutoCollectExceptions(true)
            .setAutoCollectPerformance(true, true)
            .setAutoCollectConsole(true)
            .setSendLiveMetrics(false)
            .setUseDiskRetryCaching(true)
            .setAutoDependencyCorrelation(true)
            .start()
    }
}

export const telemetryClient = appInsights.defaultClient
export function trackEvent(name: string, properties?: Record<string, unknown>) {
    telemetryClient?.trackEvent({name, properties})
}
export function trackException(error: Error, properties?: Record<string, unknown>) {
    telemetryClient?.trackException({exception: error, properties})
}
