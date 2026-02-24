/**
 * BatchGenerateHandler - World location batch generation with AI integration (Issue #761)
 *
 * Complete world expansion orchestration:
 * - Creates stub location entities (Gremlin + SQL)
 * - Calls AIDescriptionService for batched description generation
 * - Persists descriptions as base layers
 * - Enqueues World.Exit.Create events for bidirectional exit creation
 * - Emits lifecycle telemetry with metrics
 *
 * Design Philosophy (per tenets.md #7):
 * - Deterministic code captures state for repeatable play
 * - AI creates immersion (descriptions are atmospheric, not mechanical)
 * - Arrival direction is a spatial hint, not a constraint on output
 */

import type { InvocationContext } from '@azure/functions'
import type { Direction, TerrainType } from '@piquet-h/shared'
import { DIRECTIONS, TERRAIN_TYPES, getTerrainGuidance } from '@piquet-h/shared'
import type { WorldEventEnvelope } from '@piquet-h/shared/events'
import { inject, injectable } from 'inversify'
import { v4 as uuidv4 } from 'uuid'
import { TOKENS } from '../../di/tokens.js'
import type { IDeadLetterRepository } from '../../repos/deadLetterRepository.js'
import type { ILocationRepository } from '../../repos/locationRepository.js'
import type { ILayerRepository } from '../../repos/layerRepository.js'
import type { IAIDescriptionService, BatchDescriptionRequest } from '../../services/AIDescriptionService.js'
import type { ITemporalProximityService } from '../../services/temporalProximityService.js'
import { TelemetryService } from '../../telemetry/TelemetryService.js'
import type { IWorldEventPublisher } from '../worldEventPublisher.js'
import type { WorldEventHandlerResult } from '../types.js'
import { BaseWorldEventHandler, type ValidationResult } from './base/BaseWorldEventHandler.js'

/**
 * Default travel step duration when travelDurationMs is absent from the event payload.
 * Matches ActionRegistry 'move' base duration (1 minute) and the TemporalProximityService default.
 */
const DEFAULT_TRAVEL_DURATION_MS = 60_000

/**
 * Tolerance multiplier for wilderness fuzzy reconnection.
 * A candidate is accepted if its accumulated graph cost ≤ TOLERANCE × proposed direct edge cost.
 */
const WILDERNESS_RECONNECT_TOLERANCE = 2

/**
 * Settlement terrain types use strict (urban) reconnection: only a direct exit check,
 * no graph search. Currently empty – all live terrain types are non-settlement (wilderness).
 * When urban terrain types are added (e.g. 'town', 'village', 'district'), list them here.
 */
const SETTLEMENT_TERRAIN_TYPES = new Set<TerrainType>([])

/**
 * Comparator for wilderness reconnection candidates.
 * Priority: hops ASC → accumulatedTravelMs ASC → locationId lexicographic ASC.
 * Deterministic: given the same graph state, always produces the same ordering.
 */
function byProximityPriority(
    a: { hops: number; accumulatedTravelMs: number; locationId: string },
    b: { hops: number; accumulatedTravelMs: number; locationId: string }
): number {
    if (a.hops !== b.hops) return a.hops - b.hops
    if (a.accumulatedTravelMs !== b.accumulatedTravelMs) return a.accumulatedTravelMs - b.accumulatedTravelMs
    return a.locationId.localeCompare(b.locationId)
}

/**
 * Payload shape for World.Location.BatchGenerate events
 */
interface BatchGeneratePayload {
    rootLocationId: string
    terrain: TerrainType
    arrivalDirection: Direction
    expansionDepth: number
    batchSize: number
    /**
     * Traversal-time context for the step that triggered this batch (milliseconds).
     * When provided, used to calculate the wilderness reconnection budget (2× this value).
     * Falls back to DEFAULT_TRAVEL_DURATION_MS when absent.
     */
    travelDurationMs?: number
}

/**
 * Result of direction-target resolution: reconnect to an existing location or create a new stub.
 */
interface DirectionTarget {
    direction: Direction
    type: 'reconnect' | 'stub'
    /** Set when type === 'reconnect'. The ID of the existing location to connect to. */
    targetId?: string
}

/**
 * Type guard to validate batch generate payload structure
 */
function isBatchGeneratePayload(payload: unknown): payload is BatchGeneratePayload {
    if (!payload || typeof payload !== 'object') {
        return false
    }

    const p = payload as Record<string, unknown>

    return (
        typeof p.rootLocationId === 'string' &&
        typeof p.terrain === 'string' &&
        typeof p.arrivalDirection === 'string' &&
        typeof p.expansionDepth === 'number' &&
        typeof p.batchSize === 'number'
    )
}

/**
 * UUID validation (simple regex check)
 */
function isUUID(value: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return uuidRegex.test(value)
}

/**
 * Stub location data during creation
 */
interface StubLocation {
    id: string
    direction: Direction
    terrain: TerrainType
}

@injectable()
export class BatchGenerateHandler extends BaseWorldEventHandler {
    readonly type = 'World.Location.BatchGenerate' as const

    constructor(
        @inject('IDeadLetterRepository') deadLetterRepo: IDeadLetterRepository,
        @inject(TelemetryService) telemetry: TelemetryService,
        @inject(TOKENS.LocationRepository) private locationRepo: ILocationRepository,
        @inject(TOKENS.AIDescriptionService) private aiService: IAIDescriptionService,
        @inject(TOKENS.LayerRepository) private layerRepo: ILayerRepository,
        @inject(TOKENS.WorldEventPublisher) private eventPublisher: IWorldEventPublisher,
        @inject(TOKENS.TemporalProximityService) private temporalProximitySvc: ITemporalProximityService
    ) {
        super(deadLetterRepo, telemetry)
    }

    /**
     * Validate batch generate payload structure and ranges
     */
    protected validatePayload(payload: unknown): ValidationResult {
        const missing: string[] = []

        // Check basic structure
        if (!isBatchGeneratePayload(payload)) {
            if (!payload || typeof payload !== 'object') {
                return { valid: false, missing: ['payload'], message: 'Payload must be an object' }
            }

            const p = payload as Record<string, unknown>

            if (typeof p.rootLocationId !== 'string') missing.push('rootLocationId')
            if (typeof p.terrain !== 'string') missing.push('terrain')
            if (typeof p.arrivalDirection !== 'string') missing.push('arrivalDirection')
            if (typeof p.expansionDepth !== 'number') missing.push('expansionDepth')
            if (typeof p.batchSize !== 'number') missing.push('batchSize')

            if (missing.length > 0) {
                return { valid: false, missing, message: 'Missing required fields' }
            }
        }

        const p = payload as BatchGeneratePayload

        // Validate rootLocationId is a UUID
        if (!isUUID(p.rootLocationId)) {
            return {
                valid: false,
                missing: ['rootLocationId'],
                message: 'rootLocationId must be a valid UUID'
            }
        }

        // Validate terrain is in enum
        if (!TERRAIN_TYPES.includes(p.terrain as TerrainType)) {
            return {
                valid: false,
                missing: ['terrain'],
                message: `terrain must be one of: ${TERRAIN_TYPES.join(', ')}`
            }
        }

        // Validate arrivalDirection is in enum
        if (!DIRECTIONS.includes(p.arrivalDirection as Direction)) {
            return {
                valid: false,
                missing: ['arrivalDirection'],
                message: `arrivalDirection must be one of: ${DIRECTIONS.join(', ')}`
            }
        }

        // Validate expansionDepth range (1-3)
        if (p.expansionDepth < 1 || p.expansionDepth > 3) {
            return {
                valid: false,
                missing: ['expansionDepth'],
                message: 'expansionDepth must be 1-3'
            }
        }

        // Validate batchSize range (1-20)
        if (p.batchSize < 1 || p.batchSize > 20) {
            return {
                valid: false,
                missing: ['batchSize'],
                message: 'batchSize must be 1-20'
            }
        }

        // Validate optional travelDurationMs (must be a positive number when provided)
        if (p.travelDurationMs !== undefined) {
            if (typeof p.travelDurationMs !== 'number' || p.travelDurationMs <= 0) {
                return {
                    valid: false,
                    missing: ['travelDurationMs'],
                    message: 'travelDurationMs must be a positive number when provided'
                }
            }
        }

        return { valid: true, missing: [] }
    }

    /**
     * Execute batch generate handler with full AI integration
     *
     * Orchestrates:
     * 1. Neighbor direction determination (terrain-guided)
     * 2. Stub location creation (Gremlin + SQL)
     * 3. AI description generation (batched)
     * 4. Description layer persistence
     * 5. Exit event enqueueing (bidirectional)
     * 6. Metrics telemetry
     */
    protected async executeHandler(event: WorldEventEnvelope, context: InvocationContext): Promise<WorldEventHandlerResult> {
        // Safe to cast after validation passes
        const payload = event.payload as unknown as BatchGeneratePayload
        const startTime = Date.now()
        const stepMs = payload.travelDurationMs ?? DEFAULT_TRAVEL_DURATION_MS

        // Emit Started telemetry
        this.telemetry.trackGameEvent(
            'World.BatchGeneration.Started',
            {
                rootLocationId: payload.rootLocationId,
                batchSize: payload.batchSize,
                terrain: payload.terrain,
                correlationId: event.correlationId
            },
            { correlationId: event.correlationId }
        )

        try {
            // 1. Determine neighbor directions from terrain guidance
            const neighborDirections = this.determineNeighborDirections(payload.terrain, payload.arrivalDirection, payload.batchSize)

            context.log('Determined neighbor directions', {
                terrain: payload.terrain,
                arrivalDirection: payload.arrivalDirection,
                neighborDirections
            })

            // 2. Resolve each direction to a reconnection target or a new stub.
            //    Phase 1 (all terrains): check if root already has an exit pointing to a live location.
            //    Phase 2 (wilderness only): fuzzy proximity search for nearby unconnected candidates.
            const directionTargets = await this.resolveDirectionTargets(payload.rootLocationId, neighborDirections, payload.terrain, stepMs)

            const reconnectionTargets = directionTargets.filter((t) => t.type === 'reconnect' && t.targetId !== undefined) as Array<{
                direction: Direction
                type: 'reconnect'
                targetId: string
            }>
            const stubTargets = directionTargets.filter((t) => t.type === 'stub')
            const stubDirections = stubTargets.map((t) => t.direction)

            // 3. Process reconnections: ensure bidirectional exits to existing locations.
            //    ensureExitBidirectional is idempotent; calling it on an existing exit is safe
            //    and preserves travelDurationMs and other edge metadata unchanged.
            for (const target of reconnectionTargets) {
                await this.locationRepo.ensureExitBidirectional(payload.rootLocationId, target.direction, target.targetId, {
                    reciprocal: true
                })
                context.log('Reconnected to existing location', { direction: target.direction, targetId: target.targetId })
            }

            // 4. Create stub location entities for non-reconnected directions
            const stubs = await this.createStubLocations(
                payload.rootLocationId,
                stubDirections,
                payload.terrain,
                event.correlationId,
                context
            )

            context.log('Created stub locations', { count: stubs.length })

            // 5. Prepare AI batch request
            const batchRequest = this.prepareBatchRequest(stubs)

            // 6. Generate descriptions (with fallback on error)
            const descriptions = await this.aiService.batchGenerateDescriptions(batchRequest)

            context.log('Generated AI descriptions', { count: descriptions.length })

            // 7. Update location descriptions (already handled by AIDescriptionService layer persistence)
            // Note: AIDescriptionService persists base layers automatically

            // 8. Enqueue exit creation events for stubs (bidirectional)
            await this.enqueueExitEvents(payload.rootLocationId, stubs, stubDirections, event.correlationId, context)

            context.log('Enqueued exit events', { count: stubs.length })

            // 9. Emit completion telemetry with metrics
            const durationMs = Date.now() - startTime
            const totalCost = descriptions.reduce((sum, d) => sum + d.cost, 0)

            this.telemetry.trackGameEvent(
                'World.BatchGeneration.Completed',
                {
                    rootLocationId: payload.rootLocationId,
                    locationsGenerated: stubs.length,
                    reconnectionsCreated: reconnectionTargets.length,
                    exitsCreated: stubs.length * 2 + reconnectionTargets.length * 2,
                    aiCost: totalCost,
                    durationMs,
                    correlationId: event.correlationId
                },
                { correlationId: event.correlationId }
            )

            return {
                outcome: 'success',
                details: `Generated ${stubs.length} locations, reconnected ${reconnectionTargets.length} existing locations`
            }
        } catch (error) {
            // Emit failure telemetry
            this.telemetry.trackGameEvent(
                'World.BatchGeneration.Failed',
                {
                    rootLocationId: payload.rootLocationId,
                    reason: String(error),
                    correlationId: event.correlationId
                },
                { correlationId: event.correlationId }
            )

            throw error
        }
    }

    /**
     * Determine neighbor directions based on terrain guidance.
     * Filters out the arrival direction (player came from there, so already a location there).
     * Returns min(batchSize, available directions) directions.
     *
     * IMPORTANT: This method provides spatial hints to AI, not rigid constraints.
     * The AI may choose to mention exits differently in descriptions.
     */
    private determineNeighborDirections(terrain: TerrainType, arrivalDirection: Direction, batchSize: number): Direction[] {
        const guidance = getTerrainGuidance(terrain)
        const candidateDirections =
            guidance.defaultDirections && guidance.defaultDirections.length > 0
                ? guidance.defaultDirections
                : (['north', 'south', 'east', 'west'] as Direction[]) // Default to cardinal

        // Filter out arrival direction (player came from that direction, location already exists there)
        const available = candidateDirections.filter((d) => d !== arrivalDirection)

        // Take min(batchSize, available.length)
        return available.slice(0, Math.min(batchSize, available.length))
    }

    /**
     * Resolve each candidate direction to either a reconnection target (existing location)
     * or a new stub.
     *
     * **Phase 1 – strict direct check (all terrain types)**
     * For each direction, ask TemporalProximityService whether root already has an exit in
     * that direction pointing to a live location.  When found, the existing location becomes
     * the reconnection target; no stub is created.  This makes batch generation idempotent
     * and closes urban loops without duplicating nodes.
     *
     * **Phase 2 – fuzzy proximity search (non-settlement / wilderness terrain types only)**
     * For any direction still marked as a stub after Phase 1, search the exit graph outward
     * from root up to `WILDERNESS_RECONNECT_TOLERANCE × stepMs`.  Candidates are sorted
     * deterministically (hops ASC → accumulatedTravelMs ASC → locationId ASC) and the
     * nearest unassigned candidate is assigned to each stub direction in canonical order.
     * This stitches nearby branches without coordinates, bounded by the travel-time budget.
     *
     * Edge metadata (travelDurationMs etc.) on existing exits is never touched – only
     * ensureExitBidirectional is called, which is idempotent.
     */
    private async resolveDirectionTargets(
        rootId: string,
        directions: Direction[],
        terrain: TerrainType,
        stepMs: number
    ): Promise<DirectionTarget[]> {
        const results: DirectionTarget[] = directions.map((d) => ({ direction: d, type: 'stub' as const }))
        const usedCandidateIds = new Set<string>()

        // Phase 1: direct exit check for all terrain types (urban strict behavior).
        for (const target of results) {
            const check = await this.temporalProximitySvc.checkDirectReconnection(rootId, target.direction, stepMs)
            if (check.found && check.locationId) {
                target.type = 'reconnect'
                target.targetId = check.locationId
                usedCandidateIds.add(check.locationId)
            }
        }

        // Phase 2: fuzzy proximity search for wilderness (non-settlement) terrain types.
        if (!SETTLEMENT_TERRAIN_TYPES.has(terrain)) {
            const budget = WILDERNESS_RECONNECT_TOLERANCE * stepMs
            const candidates = await this.temporalProximitySvc.findWithinTravelTime(rootId, budget)

            // Deterministic sort per design: hops ASC, accumulatedTravelMs ASC, locationId ASC.
            candidates.sort(byProximityPriority)

            // Assign the nearest unassigned candidate to each remaining stub direction
            // (directions iterate in the canonical order returned by determineNeighborDirections).
            for (const target of results) {
                if (target.type !== 'stub') continue
                const candidate = candidates.find((c) => !usedCandidateIds.has(c.locationId))
                if (candidate) {
                    target.type = 'reconnect'
                    target.targetId = candidate.locationId
                    usedCandidateIds.add(candidate.locationId)
                }
            }
        }

        return results
    }

    /**
     * Create stub location entities in both Gremlin graph and SQL documents.
     * Locations have placeholder names until AI descriptions are generated.
     */
    private async createStubLocations(
        rootLocationId: string,
        directions: Direction[],
        terrain: TerrainType,
        correlationId: string,
        context: InvocationContext
    ): Promise<StubLocation[]> {
        const stubs: StubLocation[] = []

        for (const direction of directions) {
            const id = uuidv4()
            // Placeholder name (title-cased terrain)
            const terrainWords = terrain.split('-')
            const titleCasedTerrain = terrainWords.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
            const name = `Unexplored ${titleCasedTerrain}`

            // Create location entity
            await this.locationRepo.upsert({
                id,
                name,
                description: '', // Will be filled by AI-generated layer
                tags: [],
                exits: [], // Will be populated by ExitCreateHandler
                version: 1
            })

            stubs.push({ id, direction, terrain })

            context.log('Created stub location', { id, direction, terrain })
        }

        return stubs
    }

    /**
     * Prepare batch request for AIDescriptionService.
     * Maps stub locations to AIDescriptionService input format.
     *
     * IMPORTANT PER AGENT INSTRUCTIONS:
     * - arrivalDirection is passed as a spatial hint for contextual generation
     * - AI generates ONE generic description per location (not one per compass direction)
     * - Description should be objective and spatial, mentioning exits naturally
     */
    private prepareBatchRequest(stubs: StubLocation[]): BatchDescriptionRequest {
        return {
            locations: stubs.map((stub) => ({
                locationId: stub.id,
                terrain: stub.terrain,
                arrivalDirection: stub.direction, // Direction player arrives FROM root location
                neighbors: [] // Onward exits TBD (future: exit inference)
            })),
            style: 'atmospheric'
        }
    }

    /**
     * Enqueue World.Exit.Create events for bidirectional exit creation.
     * Each event creates an exit FROM root TO stub and reciprocal.
     */
    private async enqueueExitEvents(
        rootLocationId: string,
        stubs: StubLocation[],
        directions: Direction[],
        parentCorrelationId: string,
        context: InvocationContext
    ): Promise<void> {
        const events: WorldEventEnvelope[] = stubs.map((stub, idx) => ({
            eventId: uuidv4(),
            type: 'World.Exit.Create',
            occurredUtc: new Date().toISOString(),
            actor: { kind: 'system' },
            correlationId: parentCorrelationId, // Inherit from BatchGenerate
            idempotencyKey: `exit:${rootLocationId}:${directions[idx]}`,
            version: 1,
            payload: {
                fromLocationId: rootLocationId,
                toLocationId: stub.id,
                direction: directions[idx],
                reciprocal: true
            }
        }))

        await this.eventPublisher.enqueueEvents(events)

        context.log('Enqueued exit creation events', { count: events.length })
    }
}
