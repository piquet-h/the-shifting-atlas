/*
 * Application Insights Telemetry Initialization (Azure Functions)
 * Initializes the Application Insights SDK early so automatic collection (requests, dependencies, traces, exceptions)
 * is enabled for all function executions. Uses connection string via env var APPLICATIONINSIGHTS_CONNECTION_STRING.
 */
/* global process */
import appInsights from 'applicationinsights'
import {SERVICE_BACKEND, SERVICE_SWA_API} from './serviceConstants.js'
import {GameEventName, isGameEventName} from './telemetryEvents.js'

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

// Low-level passthrough (retain for legacy direct calls)
export function trackEvent(name: string, properties?: Record<string, unknown>) {
    telemetryClient?.trackEvent({name, properties})
}

export function trackException(error: Error, properties?: Record<string, unknown>) {
    telemetryClient?.trackException({exception: error, properties})
}

// Central Game Telemetry Helper: injects service, persistenceMode, and (when provided) playerGuid.

export interface GameTelemetryOptions {
    playerGuid?: string | null
    persistenceMode?: string | null
    serviceOverride?: string
}

function inferService(): string {
    // Crude inference: backend Functions app vs SWA managed API vs frontend (left to caller).
    const svc = process.env.TSA_SERVICE_NAME
    if (svc) return svc
    if (process.env.WEBSITE_SITE_NAME && process.env.AZURE_FUNCTIONS_ENVIRONMENT) {
        // Distinguish by presence of custom env variable marker (optional future enhancement)
        return SERVICE_BACKEND
    }
    return SERVICE_SWA_API // default for Functions executed inside SWA API build
}

function resolvePersistenceMode(explicit?: string | null): string | undefined {
    if (explicit) return explicit
    return process.env.PERSISTENCE_MODE || undefined // undefined signals default 'memory' upstream dashboards
}

export function trackGameEvent(name: string, properties?: Record<string, unknown>, opts?: GameTelemetryOptions) {
    // Backward-compatible route (will eventually be deprecated in favor of trackGameEventStrict)
    const finalProps: Record<string, unknown> = {...properties}
    if (finalProps.service === undefined) finalProps.service = opts?.serviceOverride || inferService()
    const pm = resolvePersistenceMode(opts?.persistenceMode)
    if (pm && finalProps.persistenceMode === undefined) finalProps.persistenceMode = pm
    if (opts?.playerGuid && finalProps.playerGuid === undefined) finalProps.playerGuid = opts.playerGuid
    trackEvent(name, finalProps)
}

// Typed payload map (lightweight – extend as events are actually emitted)
export interface EventPayloadMap {
    'Ping.Invoked': {echo?: string | null; latencyMs?: number}
    'Onboarding.GuestGuid.Started': Record<string, never>
    'Onboarding.GuestGuid.Created': {phase?: string}
    'Auth.Player.Upgraded': {linkStrategy?: string; hadGuestProgress?: boolean}
    'Room.Get': {id: string; status: number}
    'Room.Move': {from: string; to?: string; direction?: string | null; status: number; reason?: string}
    'Command.Executed': {command: string; success: boolean; latencyMs?: number | null; error?: string; roomId?: string | null}
    'World.Room.Generated': {roomId: string; model?: string; latencyMs?: number; similarity?: number; safetyVerdict?: string}
    'World.Room.Rejected': {reasonCode: string; promptHash?: string; similarity?: number}
    'World.Layer.Added': {roomId: string; layerType: string}
    'World.Exit.Created': {fromRoomId: string; toRoomId: string; dir: string; kind: string; genSource?: string}
    'Prompt.Genesis.Issued': {promptHash: string; model: string; contextSize?: number}
    'Prompt.Genesis.Rejected': {promptHash: string; failureCode: string}
    'Prompt.Genesis.Crystallized': {promptHash: string; roomId: string; tokensPrompt?: number; tokensCompletion?: number}
    'Prompt.Layer.Generated': {roomId: string; layerType: string; promptHash: string}
    'Prompt.Cost.BudgetThreshold': {percent: number}
    'Extension.Hook.Invoked': {extensionName: string; hook: string; durationMs: number; success: boolean}
    'Extension.Hook.Veto': {extensionName: string; hook: string; reasonCode: string}
    'Extension.Hook.Mutation': {extensionName: string; hook: string; fieldsChanged: string[]}
    'Multiplayer.LayerDelta.Sent': {roomId: string; layerCount: number; recipients: number}
    'Multiplayer.RoomSnapshot.HashMismatch': {roomId: string; clientHash: string; serverHash: string}
    'Multiplayer.Movement.Latency': {roomIdFrom: string; roomIdTo: string; serverMs: number; networkMs?: number}
    'Telemetry.EventName.Invalid': {requested: string}
}

export function trackGameEventStrict<E extends keyof EventPayloadMap & GameEventName>(
    name: E,
    properties: EventPayloadMap[E],
    opts?: GameTelemetryOptions
) {
    if (!isGameEventName(name)) {
        // Fall back for forward compatibility; still record but flag
        trackGameEvent('Telemetry.EventName.Invalid', {requested: name})
        return
    }
    const finalProps: Record<string, unknown> = {...(properties as Record<string, unknown>)}
    if (finalProps.service === undefined) finalProps.service = opts?.serviceOverride || inferService()
    const pm = resolvePersistenceMode(opts?.persistenceMode)
    if (pm && finalProps.persistenceMode === undefined) finalProps.persistenceMode = pm
    if (opts?.playerGuid && finalProps.playerGuid === undefined) finalProps.playerGuid = opts.playerGuid
    trackEvent(name, finalProps)
}

// Utility to extract player GUID from an Azure Functions HttpRequest-like headers object.
export function extractPlayerGuid(headers: {get(name: string): string | null | undefined} | undefined): string | undefined {
    try {
        const guid = headers?.get('x-player-guid') || undefined
        return guid && guid.length >= 8 ? guid : undefined
    } catch {
        return undefined
    }
}

// Frontend wrapper can import SERVICE_FRONTEND_WEB and call trackGameEvent with serviceOverride + player GUID.
