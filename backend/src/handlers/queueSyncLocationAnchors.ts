/**
 * Queue Sync Location Anchors Handler
 *
 * Processes batch synchronization of location anchors when world clock advances.
 * Can be triggered via queue message or direct invocation.
 *
 * Responsibilities:
 * - Validate incoming payload (worldClockTick, optional advancementReason)
 * - Invoke LocationClockManager.syncAllLocations() for batch update
 * - Emit telemetry for observability (start, completion, duration, count)
 * - Handle errors with retry semantics (transient errors bubble up)
 *
 * Configuration (env vars):
 * - TEMPORAL_SYNC_CONCURRENCY: Parallel workers for batch updates (default: 16)
 *
 * See docs/modules/world-time-temporal-reconciliation.md for specification.
 * See issue #502 for implementation details.
 */

import type { InvocationContext } from '@azure/functions'
import { inject, injectable } from 'inversify'
import { LocationClockManager } from '../services/LocationClockManager.js'
import { TelemetryService } from '../telemetry/TelemetryService.js'
import { getContainer } from './utils/contextHelpers.js'

// --- Payload Schema ----------------------------------------------------------

interface SyncLocationAnchorsPayload {
    worldClockTick: number
    advancementReason?: string
    correlationId?: string
}

interface SyncLocationAnchorsResult {
    locationsUpdated: number
    durationMs: number
    worldClockTick: number
}

// --- Validation --------------------------------------------------------------

function validatePayload(payload: unknown): SyncLocationAnchorsPayload {
    if (typeof payload !== 'object' || payload === null) {
        throw new Error('Payload must be an object')
    }

    const p = payload as Record<string, unknown>

    if (typeof p.worldClockTick !== 'number') {
        throw new Error('worldClockTick is required and must be a number')
    }

    if (p.worldClockTick < 0) {
        throw new Error('worldClockTick must be non-negative')
    }

    if (p.advancementReason !== undefined && typeof p.advancementReason !== 'string') {
        throw new Error('advancementReason must be a string if provided')
    }

    if (p.correlationId !== undefined && typeof p.correlationId !== 'string') {
        throw new Error('correlationId must be a string if provided')
    }

    return {
        worldClockTick: p.worldClockTick,
        advancementReason: p.advancementReason as string | undefined,
        correlationId: p.correlationId as string | undefined
    }
}

// --- Handler Implementation --------------------------------------------------

@injectable()
export class QueueSyncLocationAnchorsHandler {
    constructor(
        @inject(LocationClockManager) private readonly locationClockManager: LocationClockManager,
        @inject(TelemetryService) private readonly telemetry: TelemetryService
    ) {}

    async handle(message: unknown, context: InvocationContext): Promise<SyncLocationAnchorsResult> {
        const startTime = Date.now()

        // 1. Validate payload
        const payload = validatePayload(message)
        const { worldClockTick, advancementReason } = payload
        const correlationId = payload.correlationId || context.invocationId

        context.log('Queue sync location anchors triggered', {
            worldClockTick,
            advancementReason: advancementReason || 'none',
            correlationId
        })

        // 2. Emit telemetry: sync triggered
        this.telemetry.trackGameEvent('Location.Clock.QueueSyncTriggered', {
            worldClockTick,
            advancementReason: advancementReason || 'none',
            correlationId
        })

        // 3. Invoke LocationClockManager.syncAllLocations()
        let locationsUpdated: number
        try {
            locationsUpdated = await this.locationClockManager.syncAllLocations(worldClockTick)
        } catch (error) {
            // Log error and re-throw for Service Bus retry
            context.error('Failed to sync location anchors', {
                error: error instanceof Error ? error.message : String(error),
                worldClockTick,
                correlationId
            })

            // Emit error telemetry
            this.telemetry.trackGameEvent('Location.Clock.QueueSyncFailed', {
                worldClockTick,
                error: error instanceof Error ? error.message : String(error),
                correlationId
            })

            throw error // Allow Service Bus retry for transient failures
        }

        const durationMs = Date.now() - startTime

        // 4. Emit telemetry: sync completed
        this.telemetry.trackGameEvent('Location.Clock.QueueSyncCompleted', {
            worldClockTick,
            locationsUpdated,
            durationMs,
            advancementReason: advancementReason || 'none',
            correlationId
        })

        context.log('Queue sync location anchors completed', {
            worldClockTick,
            locationsUpdated,
            durationMs,
            correlationId
        })

        return {
            locationsUpdated,
            durationMs,
            worldClockTick
        }
    }
}

// --- Entrypoint for Azure Functions ------------------------------------------

export async function queueSyncLocationAnchors(message: unknown, context: InvocationContext): Promise<void> {
    const container = getContainer(context)
    const handler = container.get(QueueSyncLocationAnchorsHandler)
    await handler.handle(message, context)
}
