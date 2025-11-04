/*
 * Application Insights Telemetry Initialization (Azure Functions)
 * Initializes the Application Insights SDK early so automatic collection (requests, dependencies, traces, exceptions)
 * is enabled for all function executions. Uses connection string via env var APPLICATIONINSIGHTS_CONNECTION_STRING.
 *
 * In test mode (NODE_ENV=test), Application Insights is completely disabled to avoid slow initialization and network timeouts.
 */
import { GameEventName, isGameEventName, SERVICE_BACKEND, SERVICE_SWA_API } from '@piquet-h/shared'
import appInsights from 'applicationinsights'
import { randomUUID } from 'node:crypto'

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

// Internal test interceptor (not used in production). Allows unit tests to observe
// enriched game events without patching the underlying Application Insights client.
let eventInterceptor: ((name: string, properties: Record<string, unknown>) => void) | null = null
export function __setTelemetryEventInterceptor(interceptor: ((name: string, properties: Record<string, unknown>) => void) | null) {
    eventInterceptor = interceptor
}

/**
 * Low-level event emission (no enrichment). Exposed for rare cases where domain
 * enrichment is handled externally. Lint rule forbids direct use of the old
 * trackEvent helper; use this or (preferably) trackGameEvent / trackGameEventStrict.
 */
function trackEventClient(name: string, properties?: Record<string, unknown>) {
    telemetryClient?.trackEvent({ name, properties })
    if (eventInterceptor) {
        eventInterceptor(name, properties || {})
    }
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
    // Always attach correlationId; generate if not supplied
    if (finalProps.correlationId === undefined) finalProps.correlationId = opts?.correlationId || randomUUID()
    // Attach operationId if available from Application Insights context
    const opId = getOperationId()
    if (opId && finalProps.operationId === undefined) finalProps.operationId = opId
    trackEventClient(name, finalProps)
}

/**
 * Strict telemetry helper that validates event names against the shared package enumeration.
 * Only accepts GameEventName types to prevent typos and ensure consistency.
 */
export function trackGameEventStrict(name: GameEventName, properties: Record<string, unknown>, opts?: GameTelemetryOptions) {
    if (!isGameEventName(name)) {
        trackGameEvent('Telemetry.EventName.Invalid', { requested: name })
        return
    }
    const finalProps: Record<string, unknown> = { ...properties }
    if (finalProps.service === undefined) finalProps.service = opts?.serviceOverride || inferService()
    const pm = resolvePersistenceMode(opts?.persistenceMode)
    if (pm && finalProps.persistenceMode === undefined) finalProps.persistenceMode = pm
    if (opts?.playerGuid && finalProps.playerGuid === undefined) finalProps.playerGuid = opts.playerGuid
    if (finalProps.correlationId === undefined) finalProps.correlationId = opts?.correlationId || randomUUID()
    const opId = getOperationId()
    if (opId && finalProps.operationId === undefined) finalProps.operationId = opId
    trackEventClient(name, finalProps)
}

export const CORRELATION_HEADER = 'x-correlation-id'

export function extractCorrelationId(headers: { get(name: string): string | null | undefined } | undefined): string {
    try {
        const correlationId = headers?.get(CORRELATION_HEADER) || undefined
        return correlationId || randomUUID()
    } catch {
        return randomUUID()
    }
}

export function extractPlayerGuid(headers: { get(name: string): string | null | undefined } | undefined): string | undefined {
    try {
        const guid = headers?.get('x-player-guid') || undefined
        return guid || undefined
    } catch {
        return undefined
    }
}

function getOperationId(): string | undefined {
    try {
        const client = appInsights.defaultClient
        if (!client) return undefined
        const tags = client.context?.tags
        const key = client.context?.keys?.operationId
        if (tags && key && tags[key]) return tags[key]
        return undefined
    } catch {
        return undefined
    }
}
