/**
 * Area Generation Orchestrator
 *
 * Generates a coherent "next area" based on context, using bounded
 * World.Location.BatchGenerate events. Supports three modes:
 * - auto: Uses RealmService context to pick terrain/realm from anchor
 * - urban: Anchors to settlement-type context
 * - wilderness: Anchors to open/natural terrain context
 *
 * Issue: piquet-h/the-shifting-atlas#(area-generation-orchestrator)
 */

import type { Direction, TerrainType } from '@piquet-h/shared'
import { STARTER_LOCATION_ID, isTerrainType } from '@piquet-h/shared'
import type { WorldEventEnvelope } from '@piquet-h/shared/events'
import { inject, injectable } from 'inversify'
import { v4 as uuidv4 } from 'uuid'
import type { ILocationRepository } from '../repos/locationRepository.js'
import { RealmService } from './RealmService.js'
import { TelemetryService } from '../telemetry/TelemetryService.js'
import type { IWorldEventPublisher } from '../worldEvents/worldEventPublisher.js'
import { TOKENS } from '../di/tokens.js'

/**
 * Thrown when the requested anchor location does not exist in the repository.
 * Callers (HTTP handler) catch this for a 404 response.
 */
export class LocationNotFoundError extends Error {
    constructor(locationId: string) {
        super(`Anchor location not found: ${locationId}`)
        this.name = 'LocationNotFoundError'
    }
}

/**
 * Generation mode for area orchestration.
 * - auto: Use RealmService context to determine terrain/biome
 * - urban: Favor settlement / corridor topology
 * - wilderness: Favor open / natural terrain topology
 */
export type AreaGenerationMode = 'urban' | 'wilderness' | 'auto'

/**
 * Input parameters for the orchestrator.
 */
export interface AreaGenerationInput {
    /** Anchor location ID. If omitted, falls back to the world starter location. */
    anchorLocationId?: string
    /** Generation mode governing terrain / realm selection. */
    mode: AreaGenerationMode
    /** Target number of locations to generate (clamped to MAX_BUDGET_LOCATIONS). */
    budgetLocations: number
    /** Optional narrative realm hints forwarded to the batch generation event. */
    realmHints?: string[]
    /**
     * Caller-supplied idempotency key. Repeated requests with the same key
     * will produce events with stable idempotency keys, preventing duplicate
     * graph expansion.
     */
    idempotencyKey?: string
}

/**
 * Result returned by the orchestrator after enqueueing batch generation events.
 */
export interface AreaGenerationResult {
    /** Number of World.Location.BatchGenerate events enqueued. */
    enqueuedCount: number
    /** Resolved anchor location ID used for generation. */
    anchorLocationId: string
    /** Resolved terrain type used for batch generation. */
    terrain: TerrainType
    /** Stable idempotency key used across all enqueued events. */
    idempotencyKey: string
    /** True when the requested budget was clamped to the maximum. */
    clamped: boolean
}

/**
 * Maximum number of locations that can be budgeted in a single orchestration request.
 * Matches the prefetch config maxBatchSize to stay consistent with existing event sizing.
 */
export const MAX_BUDGET_LOCATIONS = 20

/**
 * Default terrain type when no terrain metadata is available on the anchor.
 */
const DEFAULT_TERRAIN: TerrainType = 'open-plain'

/**
 * Default expansion direction used as a spatial hint for AI generation when
 * no directional context (player movement) is available.
 */
const DEFAULT_EXPANSION_DIRECTION: Direction = 'north'

/**
 * Determine a TerrainType from the location entity or mode.
 * Resolution order:
 *  1. Location's own terrain field (if valid)
 *  2. Mode-specific default
 *  3. Global default (open-plain)
 */
function resolveTerrainForMode(terrain: TerrainType | undefined, mode: AreaGenerationMode): TerrainType {
    if (terrain && isTerrainType(terrain)) {
        return terrain
    }
    switch (mode) {
        case 'urban':
            return 'narrow-corridor'
        case 'wilderness':
            return 'open-plain'
        default:
            return DEFAULT_TERRAIN
    }
}

/**
 * Build a World.Location.BatchGenerate event envelope for the orchestrator.
 */
function buildOrchestratorBatchEvent(
    anchorLocationId: string,
    terrain: TerrainType,
    batchSize: number,
    correlationId: string,
    idempotencyKey: string,
    realmHints?: string[]
): WorldEventEnvelope {
    return {
        eventId: uuidv4(),
        type: 'World.Location.BatchGenerate',
        occurredUtc: new Date().toISOString(),
        actor: { kind: 'system' },
        correlationId,
        idempotencyKey,
        version: 1,
        payload: {
            rootLocationId: anchorLocationId,
            terrain,
            arrivalDirection: DEFAULT_EXPANSION_DIRECTION,
            expansionDepth: 1,
            batchSize,
            ...(realmHints && realmHints.length > 0 ? { realmHints } : {})
        }
    }
}

/**
 * Area Generation Orchestrator
 *
 * Encapsulates the context-driven, budgeted area generation workflow.
 * Designed for DI injection; relies on ILocationRepository, RealmService,
 * IWorldEventPublisher and TelemetryService.
 */
@injectable()
export class AreaGenerationOrchestrator {
    constructor(
        @inject(TOKENS.LocationRepository) private readonly locationRepo: ILocationRepository,
        @inject(RealmService) private readonly realmService: RealmService,
        @inject(TOKENS.WorldEventPublisher) private readonly eventPublisher: IWorldEventPublisher,
        @inject(TelemetryService) private readonly telemetry: TelemetryService
    ) {}

    /**
     * Execute the area generation orchestration:
     * 1. Resolve anchor location (fallback to starter if absent)
     * 2. Determine terrain (via RealmService in auto mode)
     * 3. Clamp budget
     * 4. Build & enqueue World.Location.BatchGenerate event(s)
     * 5. Emit lifecycle telemetry
     *
     * @param input - Orchestration parameters
     * @param correlationId - Caller's correlation ID for traceability
     * @returns Result describing enqueued events
     * @throws Error when the anchor location is not found
     */
    async orchestrate(input: AreaGenerationInput, correlationId: string): Promise<AreaGenerationResult> {
        const startTime = Date.now()

        // Resolve idempotency key
        const baseKey = input.idempotencyKey ?? uuidv4()

        // Resolve anchor
        const anchorId = input.anchorLocationId ?? STARTER_LOCATION_ID

        this.telemetry.trackGameEvent('World.AreaGeneration.Started', {
            anchorLocationId: anchorId,
            mode: input.mode,
            budgetLocations: input.budgetLocations,
            idempotencyKey: baseKey,
            correlationId
        })

        try {
            // Fetch anchor location to get terrain + realm membership
            const anchor = await this.locationRepo.get(anchorId)
            if (!anchor) {
                throw new LocationNotFoundError(anchorId)
            }

            // Determine terrain
            let terrain: TerrainType

            if (input.mode === 'auto') {
                // In auto mode, use RealmService to get narrative context for terrain selection
                const context = await this.realmService.getLocationContext(anchorId, 0)
                // Prefer the location's own terrain; fall back to first geographic realm name hint
                terrain = resolveTerrainForMode(anchor.terrain, 'auto')

                // If the location has no terrain but is in a named geographic realm, pick a biome-based default.
                // This is a best-effort heuristic: realm names are human-authored and substring matching is
                // intentionally broad so common names ('Darkwood Forest', 'Ironhill Mountains') work out of the box.
                if (!anchor.terrain && context.geographic.length > 0) {
                    const geographicName = context.geographic[0].name.toLowerCase()
                    if (geographicName.includes('forest')) {
                        terrain = 'dense-forest'
                    } else if (geographicName.includes('hill') || geographicName.includes('mountain')) {
                        terrain = 'hilltop'
                    } else if (geographicName.includes('river') || geographicName.includes('coast')) {
                        terrain = 'riverbank'
                    }
                }
            } else {
                terrain = resolveTerrainForMode(anchor.terrain, input.mode)
            }

            // Clamp budget
            const clamped = input.budgetLocations > MAX_BUDGET_LOCATIONS
            const batchSize = Math.min(input.budgetLocations, MAX_BUDGET_LOCATIONS)

            // Merge caller-provided realm hints with narrative tags from anchor
            const realmHints = input.realmHints && input.realmHints.length > 0 ? input.realmHints : undefined

            // Build event with stable idempotency key derived from base key + anchor
            const eventIdempotencyKey = `area-gen:${baseKey}:${anchorId}`
            const event = buildOrchestratorBatchEvent(anchorId, terrain, batchSize, correlationId, eventIdempotencyKey, realmHints)

            // Enqueue
            await this.eventPublisher.enqueueEvents([event])

            const result: AreaGenerationResult = {
                enqueuedCount: 1,
                anchorLocationId: anchorId,
                terrain,
                idempotencyKey: baseKey,
                clamped
            }

            this.telemetry.trackGameEvent('World.AreaGeneration.Completed', {
                anchorLocationId: anchorId,
                mode: input.mode,
                batchSize,
                terrain,
                clamped,
                idempotencyKey: baseKey,
                correlationId,
                durationMs: Date.now() - startTime
            })

            return result
        } catch (error) {
            this.telemetry.trackGameEvent('World.AreaGeneration.Failed', {
                anchorLocationId: anchorId,
                mode: input.mode,
                reason: error instanceof Error ? error.message : String(error),
                idempotencyKey: baseKey,
                correlationId,
                durationMs: Date.now() - startTime
            })
            throw error
        }
    }
}
