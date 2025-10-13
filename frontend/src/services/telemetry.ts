/*
 * Frontend Telemetry (Application Insights Web SDK)
 * Initializes client with connection string provided via Vite env (VITE_APPINSIGHTS_CONNECTION_STRING).
 * Gracefully no-ops if not supplied (e.g., local dev without telemetry).
 */
/* global localStorage */
import { ApplicationInsights } from '@microsoft/applicationinsights-web'
import { GAME_EVENT_NAMES } from '@piquet-h/shared'

let appInsights: ApplicationInsights | undefined

export function initTelemetry() {
    if (appInsights) return appInsights
    const connectionString = import.meta.env.VITE_APPINSIGHTS_CONNECTION_STRING
    if (!connectionString) return undefined
    appInsights = new ApplicationInsights({
        config: {
            connectionString,
            enableAutoRouteTracking: true,
            enableCorsCorrelation: true,
            disableFetchTracking: false,
            disableAjaxTracking: false
            // Adjust sampling later if needed (default 100%)
        }
    })
    appInsights.loadAppInsights()
    appInsights.trackPageView() // initial load
    return appInsights
}

export function trackEvent(name: string, properties?: Record<string, unknown>) {
    if (!appInsights) return
    appInsights.trackEvent({ name }, properties as Record<string, unknown> | undefined)
}

// Higher-level game event wrapper (frontend)
// Automatically injects service + playerGuid (from localStorage) + optional persistence mode (via env var)
export function trackGameEventClient(name: string, properties?: Record<string, unknown>) {
    if (!appInsights) return
    if (!(GAME_EVENT_NAMES as readonly string[]).includes(name)) {
        // Surface invalid event names explicitly for later cleanup / dashboards
        trackEvent('Telemetry.EventName.Invalid', { requested: name })
        return
    }
    let playerGuid: string | undefined
    try {
        const g = localStorage.getItem('tsa.playerGuid')
        if (g && /^[0-9a-fA-F-]{8}/.test(g)) playerGuid = g
    } catch {
        /* ignore */
    }
    const persistenceMode = import.meta.env.VITE_PERSISTENCE_MODE || undefined
    const service = 'frontend-web'
    const merged: Record<string, unknown> = {
        service,
        ...(persistenceMode ? { persistenceMode } : {}),
        ...(playerGuid ? { playerGuid } : {}),
        ...properties
    }
    trackEvent(name, merged)
}

export function trackError(error: Error, properties?: Record<string, unknown>) {
    appInsights?.trackException({ error, properties })
}

export default appInsights
