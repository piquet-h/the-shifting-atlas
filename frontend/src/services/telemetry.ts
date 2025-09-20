/*
 * Frontend Telemetry (Application Insights Web SDK)
 * Initializes client with connection string provided via Vite env (VITE_APPINSIGHTS_CONNECTION_STRING).
 * Gracefully no-ops if not supplied (e.g., local dev without telemetry).
 */
import { ApplicationInsights } from '@microsoft/applicationinsights-web';

let appInsights: ApplicationInsights | undefined;

export function initTelemetry() {
    if (appInsights) return appInsights;
    const connectionString = import.meta.env.VITE_APPINSIGHTS_CONNECTION_STRING;
    if (!connectionString) return undefined;
    appInsights = new ApplicationInsights({
        config: {
            connectionString,
            enableAutoRouteTracking: true,
            enableCorsCorrelation: true,
            disableFetchTracking: false,
            disableAjaxTracking: false,
            // Adjust sampling later if needed (default 100%)
        },
    });
    appInsights.loadAppInsights();
    appInsights.trackPageView(); // initial load
    return appInsights;
}

export function trackEvent(name: string, properties?: Record<string, unknown>) {
    if (!appInsights) return;
    appInsights.trackEvent({ name }, properties as Record<string, unknown> | undefined);
}

export function trackError(error: Error, properties?: Record<string, unknown>) {
    appInsights?.trackException({ error, properties });
}

export default appInsights;
