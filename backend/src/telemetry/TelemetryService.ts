/**
 * Telemetry Service - Central service for emitting game telemetry events
 *
 * Provides enriched telemetry methods that wrap ITelemetryClient.
 * All handlers should inject this service (or ITelemetryClient directly) via DI.
 * Never import standalone telemetry functions from this service.
 */
import { GameEventName, isGameEventName, SERVICE_BACKEND, SERVICE_SWA_API } from '@piquet-h/shared'
import { inject, injectable } from 'inversify'
import { randomUUID } from 'node:crypto'
import type { ITelemetryClient } from './ITelemetryClient.js'

export interface GameTelemetryOptions {
    playerGuid?: string | null
    persistenceMode?: string | null
    serviceOverride?: string
    correlationId?: string | null
}

@injectable()
export class TelemetryService {
    constructor(@inject('ITelemetryClient') private client: ITelemetryClient) {}

    /**
     * Track a game event with automatic enrichment
     * @param name - Event name (should be from GameEventName enum)
     * @param properties - Event properties
     * @param opts - Optional enrichment options
     */
    trackGameEvent(name: string, properties?: Record<string, unknown>, opts?: GameTelemetryOptions): void {
        const finalProps: Record<string, unknown> = { ...properties }

        // Enrich with service name
        if (finalProps.service === undefined) {
            finalProps.service = opts?.serviceOverride || this.inferService()
        }

        // Enrich with persistence mode
        const pm = this.resolvePersistenceMode(opts?.persistenceMode)
        if (pm && finalProps.persistenceMode === undefined) {
            finalProps.persistenceMode = pm
        }

        // Enrich with player GUID
        if (opts?.playerGuid && finalProps.playerGuid === undefined) {
            finalProps.playerGuid = opts.playerGuid
        }

        // Always attach correlationId; generate if not supplied
        if (finalProps.correlationId === undefined) {
            finalProps.correlationId = opts?.correlationId || randomUUID()
        }

        this.client.trackEvent({ name, properties: finalProps })
    }

    /**
     * Track a game event with strict name validation
     * Only accepts GameEventName types to prevent typos
     */
    trackGameEventStrict(name: GameEventName, properties: Record<string, unknown>, opts?: GameTelemetryOptions): void {
        if (!isGameEventName(name)) {
            this.trackGameEvent('Telemetry.EventName.Invalid', { requested: name })
            return
        }
        this.trackGameEvent(name, properties, opts)
    }

    /**
     * Track an exception
     */
    trackException(error: Error, properties?: Record<string, unknown>): void {
        this.client.trackException({ exception: error, properties })
    }

    private inferService(): string {
        const svc = process.env.TSA_SERVICE_NAME
        if (svc) return svc
        if (process.env.WEBSITE_SITE_NAME && process.env.AZURE_FUNCTIONS_ENVIRONMENT) {
            return SERVICE_BACKEND
        }
        return SERVICE_SWA_API
    }

    private resolvePersistenceMode(explicit?: string | null): string | undefined {
        if (explicit) return explicit
        return process.env.PERSISTENCE_MODE || undefined
    }
}
