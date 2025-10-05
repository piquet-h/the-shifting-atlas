/*
 * Application Insights Telemetry Initialization (Azure Functions)
 * Initializes the Application Insights SDK early so automatic collection (requests, dependencies, traces, exceptions)
 * is enabled for all function executions. Uses connection string via env var APPLICATIONINSIGHTS_CONNECTION_STRING.
 */
import appInsights from 'applicationinsights'
import { randomUUID } from 'node:crypto'
import { SERVICE_BACKEND, SERVICE_SWA_API } from './serviceConstants.js'
import { GameEventName, isGameEventName } from './telemetryEvents.js'

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

// Expose a telemetryClient even without a configured connection (tests / local)
interface AppInsightsClient {
    trackEvent(args: { name: string; properties?: Record<string, unknown> }): void
    trackException(args: { exception: Error; properties?: Record<string, unknown> }): void
}

const aiClient = (appInsights as unknown as { defaultClient?: AppInsightsClient }).defaultClient

export const telemetryClient: AppInsightsClient =
    aiClient ||
    ({
        trackEvent() {
            /* noop */
        },
        trackException() {
            /* noop */
        }
    } as AppInsightsClient)

export function trackEvent(name: string, properties?: Record<string, unknown>) {
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
    if (opts?.correlationId && finalProps.correlationId === undefined) finalProps.correlationId = opts.correlationId
    trackEvent(name, finalProps)
}

export interface EventPayloadMap {
    'Ping.Invoked': { echo?: string | null; latencyMs?: number }
    'Onboarding.GuestGuid.Started': Record<string, never>
    'Onboarding.GuestGuid.Created': { phase?: string }
    'Onboarding.GuestGuid.Completed': { created: boolean }
    'Auth.Player.Upgraded': { linkStrategy?: string; hadGuestProgress?: boolean }
    'Player.Get': { playerGuid: string; status: number; latencyMs?: number }
    'Player.Created': { playerGuid: string; method: string; latencyMs?: number }
    'Location.Get': { id: string; status: number; latencyMs?: number }
    'Location.Move': {
        from: string
        to?: string
        direction?: string | null
        status: number
        reason?: string
        rawInput?: string
        latencyMs?: number
    }
    'Navigation.Input.Ambiguous': { from: string; input: string; reason: string }
    'Command.Executed': { command: string; success: boolean; latencyMs?: number | null; error?: string; locationId?: string | null }
    'World.Location.Generated': { locationId: string; model?: string; latencyMs?: number; similarity?: number; safetyVerdict?: string }
    'World.Location.Rejected': { reasonCode: string; promptHash?: string; similarity?: number }
    'World.Location.Upsert': {
        locationId: string
        ru?: number
        latencyMs?: number
        success: boolean
        created?: boolean
        revision?: number
        reason?: string
    }
    'World.Layer.Added': { locationId: string; layerType: string }
    'World.Exit.Created': { fromLocationId: string; toLocationId: string; dir: string; kind: string; genSource?: string }
    'World.Exit.Removed': { fromLocationId: string; dir: string; toLocationId?: string }
    'World.Event.Processed': {
        eventType: string
        actorKind: string
        latencyMs?: number
        duplicate: boolean
        correlationId?: string
        causationId?: string
    }
    'World.Event.Duplicate': {
        eventType: string
        actorKind: string
        idempotencyKeyHash: string
        correlationId?: string
        causationId?: string
    }
    'Prompt.Genesis.Issued': { promptHash: string; model: string; contextSize?: number }
    'Prompt.Genesis.Rejected': { promptHash: string; failureCode: string }
    'Prompt.Genesis.Crystallized': { promptHash: string; locationId: string; tokensPrompt?: number; tokensCompletion?: number }
    'Prompt.Layer.Generated': { locationId: string; layerType: string; promptHash: string }
    'Prompt.Cost.BudgetThreshold': { percent: number }
    'Extension.Hook.Invoked': { extensionName: string; hook: string; durationMs: number; success: boolean }
    'Extension.Hook.Veto': { extensionName: string; hook: string; reasonCode: string }
    'Extension.Hook.Mutation': { extensionName: string; hook: string; fieldsChanged: string[] }
    'Multiplayer.LayerDelta.Sent': { locationId: string; layerCount: number; recipients: number }
    'Multiplayer.LocationSnapshot.HashMismatch': { locationId: string; clientHash: string; serverHash: string }
    'Multiplayer.Movement.Latency': { locationIdFrom: string; locationIdTo: string; serverMs: number; networkMs?: number }
    'Telemetry.EventName.Invalid': { requested: string }
}

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
    trackEvent(name, finalProps)
}

export function extractPlayerGuid(headers: { get(name: string): string | null | undefined } | undefined): string | undefined {
    try {
        const guid = headers?.get('x-player-guid') || undefined
        return guid && guid.length >= 8 ? guid : undefined
    } catch {
        return undefined
    }
}

// Correlation ID handling: accept client header or generate; cap length for safety

export const CORRELATION_HEADER = 'x-correlation-id'

export function extractCorrelationId(
    headers: { get(name: string): string | null | undefined } | undefined,
    generate?: () => string
): string {
    try {
        const raw = headers?.get(CORRELATION_HEADER) || undefined
        if (raw) {
            return raw.length > 120 ? raw.slice(0, 120) : raw
        }
    } catch {
        /* ignore */
    }
    if (typeof randomUUID === 'function') return randomUUID()
    return (generate || (() => Math.random().toString(36).slice(2)))()
}
