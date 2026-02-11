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
import { DIRECTIONS, TERRAIN_TYPES, getTerrainGuidance, getOppositeDirection } from '@piquet-h/shared'
import type { WorldEventEnvelope } from '@piquet-h/shared/events'
import { inject, injectable } from 'inversify'
import { v4 as uuidv4 } from 'uuid'
import { TOKENS } from '../../di/tokens.js'
import type { IDeadLetterRepository } from '../../repos/deadLetterRepository.js'
import type { ILocationRepository } from '../../repos/locationRepository.js'
import type { ILayerRepository } from '../../repos/layerRepository.js'
import type { IAIDescriptionService, BatchDescriptionRequest, GeneratedDescription } from '../../services/AIDescriptionService.js'
import { TelemetryService } from '../../telemetry/TelemetryService.js'
import type { IWorldEventPublisher } from '../worldEventPublisher.js'
import type { WorldEventHandlerResult } from '../types.js'
import { BaseWorldEventHandler, type ValidationResult } from './base/BaseWorldEventHandler.js'

/**
 * Payload shape for World.Location.BatchGenerate events
 */
interface BatchGeneratePayload {
    rootLocationId: string
    terrain: TerrainType
    arrivalDirection: Direction
    expansionDepth: number
    batchSize: number
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
        @inject(TelemetryService) private telemetry: TelemetryService,
        @inject(TOKENS.LocationRepository) private locationRepo: ILocationRepository,
        @inject(TOKENS.AIDescriptionService) private aiService: IAIDescriptionService,
        @inject(TOKENS.LayerRepository) private layerRepo: ILayerRepository,
        @inject(TOKENS.WorldEventPublisher) private eventPublisher: IWorldEventPublisher
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
            const neighborDirections = this.determineNeighborDirections(
                payload.terrain,
                payload.arrivalDirection,
                payload.batchSize
            )

            context.log('Determined neighbor directions', {
                terrain: payload.terrain,
                arrivalDirection: payload.arrivalDirection,
                neighborDirections
            })

            // 2. Create stub location entities (Gremlin + SQL)
            const stubs = await this.createStubLocations(
                payload.rootLocationId,
                neighborDirections,
                payload.terrain,
                event.correlationId,
                context
            )

            context.log('Created stub locations', { count: stubs.length })

            // 3. Prepare AI batch request
            const batchRequest = this.prepareBatchRequest(payload.rootLocationId, stubs, payload.terrain, payload.arrivalDirection)

            // 4. Generate descriptions (with fallback on error)
            const descriptions = await this.aiService.batchGenerateDescriptions(batchRequest)

            context.log('Generated AI descriptions', { count: descriptions.length })

            // 5. Update location descriptions (already handled by AIDescriptionService layer persistence)
            // Note: AIDescriptionService persists base layers automatically

            // 6. Enqueue exit creation events (bidirectional)
            await this.enqueueExitEvents(payload.rootLocationId, stubs, neighborDirections, event.correlationId, context)

            context.log('Enqueued exit events', { count: stubs.length })

            // 7. Emit completion telemetry with metrics
            const durationMs = Date.now() - startTime
            const totalCost = descriptions.reduce((sum, d) => sum + d.cost, 0)

            this.telemetry.trackGameEvent(
                'World.BatchGeneration.Completed',
                {
                    rootLocationId: payload.rootLocationId,
                    locationsGenerated: stubs.length,
                    exitsCreated: stubs.length * 2, // bidirectional
                    aiCost: totalCost,
                    durationMs,
                    correlationId: event.correlationId
                },
                { correlationId: event.correlationId }
            )

            return {
                outcome: 'success',
                details: `Generated ${stubs.length} locations with ${stubs.length * 2} exits`
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
     * Filters out the arrival direction (player came from there).
     * Returns min(batchSize, available directions) directions.
     *
     * IMPORTANT: This method provides spatial hints to AI, not rigid constraints.
     * The AI may choose to mention exits differently in descriptions.
     */
    private determineNeighborDirections(terrain: TerrainType, arrivalDirection: Direction, batchSize: number): Direction[] {
        const guidance = getTerrainGuidance(terrain)
        const candidateDirections = guidance.defaultDirections && guidance.defaultDirections.length > 0
            ? guidance.defaultDirections
            : ['north', 'south', 'east', 'west'] as Direction[] // Default to cardinal

        // Filter out arrival direction (player came from there, don't generate stub in that direction)
        const oppositeArrival = getOppositeDirection(arrivalDirection)
        const available = candidateDirections.filter((d) => d !== oppositeArrival)

        // Take min(batchSize, available.length)
        return available.slice(0, Math.min(batchSize, available.length))
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
            const name = `Unexplored ${terrain.replace('-', ' ')}` // Placeholder

            // Create location entity
            await this.locationRepo.upsert({
                id,
                name,
                description: '', // Will be filled by AI-generated layer
                terrain,
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
    private prepareBatchRequest(
        rootLocationId: string,
        stubs: StubLocation[],
        terrain: TerrainType,
        arrivalDirection: Direction
    ): BatchDescriptionRequest {
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
