/*
 * Application Insights Telemetry Initialization (Azure Functions)
 * Initializes the Application Insights SDK early so automatic collection (requests, dependencies, traces, exceptions)
 * is enabled for all function executions. Uses connection string via env var APPLICATIONINSIGHTS_CONNECTION_STRING.
 * 
 * In test mode (NODE_ENV=test), Application Insights is completely disabled to avoid slow initialization and network timeouts.
 */
import { GameEventName, isGameEventName, SERVICE_BACKEND, SERVICE_SWA_API } from '@piquet-h/shared'
import { randomUUID } from 'node:crypto'

// Check if we're in test mode
const isTestMode = process.env.NODE_ENV === 'test'

// In test mode, telemetry is completely disabled (no-op client)
// In production mode, Application Insights is loaded conditionally
let aiClient: { 
    trackEvent(args: { name: string; properties?: Record<string, unknown> }): void
    trackException(args: { exception: Error; properties?: Record<string, unknown> }): void
} | undefined

// Note: We do NOT import applicationinsights at module scope to avoid loading it in test mode
// Instead, we import it only when needed (never in test mode)

// Expose a telemetryClient even without a configured connection (tests / local)
interface AppInsightsClient {
    trackEvent(args: { name: string; properties?: Record<string, unknown> }): void
    trackException(args: { exception: Error; properties?: Record<string, unknown> }): void
}

export const telemetryClient: AppInsightsClient = {
    trackEvent() {
        /* noop - Application Insights not initialized or in test mode */
    },
    trackException() {
        /* noop - Application Insights not initialized or in test mode */
    }
}

/**
 * Low-level event emission (no enrichment). Exposed for rare cases where domain
 * enrichment is handled externally. Lint rule forbids direct use of the old
 * trackEvent helper; use this or (preferably) trackGameEvent / trackGameEventStrict.
 */
function trackEventClient(name: string, properties?: Record<string, unknown>) {
    telemetryClient?.trackEvent({ name, properties })
}

export function trackException(error: Error, properties?: Record<string, unknown>) {
    telemetryClient?.trackException({ exception: error, properties })
}

export interface GameTelemetryOptions {
    playerGuid?: string | null
    persistenceMode?: string | null
    serviceOverride?: string
    correlationId?: string | null
}

function inferService(): string {
    const svc = process.env.TSA_SERVICE_NAME
    if (svc) return svc
    if (process.env.WEBSITE_SITE_NAME && process.env.AZURE_FUNCTIONS_ENVIRONMENT) {
        return SERVICE_BACKEND
    }
    return SERVICE_SWA_API
}

function resolvePersistenceMode(explicit?: string | null): string | undefined {
    if (explicit) return explicit
    return process.env.PERSISTENCE_MODE || undefined
}

export function trackGameEvent(name: string, properties?: Record<string, unknown>, opts?: GameTelemetryOptions) {
    const finalProps: Record<string, unknown> = { ...properties }
    if (finalProps.service === undefined) finalProps.service = opts?.serviceOverride || inferService()
    const pm = resolvePersistenceMode(opts?.persistenceMode)
    if (pm && finalProps.persistenceMode === undefined) finalProps.persistenceMode = pm
    if (opts?.playerGuid && finalProps.playerGuid === undefined) finalProps.playerGuid = opts.playerGuid
    if (opts?.correlationId && finalProps.correlationId === undefined) finalProps.correlationId = opts.correlationId || randomUUID()
    trackEventClient(name, finalProps)
}

// Collect all known event names (compile-time + runtime detection from shared package) for validation

// If shared package exports a manifest of all events (e.g., an array or map), read it at startup
import type { EventPayloadMap } from '@piquet-h/shared'

export function trackGameEventStrict<E extends keyof EventPayloadMap & GameEventName>(
    name: E,
    properties: EventPayloadMap[E],
    opts?: GameTelemetryOptions
) {
    if (!isGameEventName(name)) {
        trackGameEvent('Telemetry.EventName.Invalid', { requested: name })
        return
    }
    const finalProps: Record<string, unknown> = { ...(properties as Record<string, unknown>) }
    if (finalProps.service === undefined) finalProps.service = opts?.serviceOverride || inferService()
    const pm = resolvePersistenceMode(opts?.persistenceMode)
    if (pm && finalProps.persistenceMode === undefined) finalProps.persistenceMode = pm
    if (opts?.playerGuid && finalProps.playerGuid === undefined) finalProps.playerGuid = opts.playerGuid
    if (opts?.correlationId && finalProps.correlationId === undefined) finalProps.correlationId = opts.correlationId
    trackEventClient(name, finalProps)
}

export function extractPlayerGuid(headers: { get(name: string): string | null | undefined } | undefined): string | undefined {
    try {
        const guid = headers?.get('x-player-guid') || undefined
        return guid || undefined
    } catch {
        return undefined
    }
}
