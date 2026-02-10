/**
 * BatchGenerateHandler - World location batch generation scaffold (Issue #759)
 *
 * Foundation for batch world expansion:
 * - Validates batch generation event payloads
 * - Emits lifecycle telemetry (Started, Completed, Failed)
 * - NO world mutations yet (deferred to #761 for AI integration)
 *
 * Design Philosophy (per tenets.md #7):
 * - Deterministic code captures state for repeatable play
 * - AI creates immersion (integration in #761)
 * - Scaffold demonstrates handler pipeline before adding complexity
 */

import type { InvocationContext } from '@azure/functions'
import type { Direction, TerrainType } from '@piquet-h/shared'
import { DIRECTIONS, TERRAIN_TYPES } from '@piquet-h/shared'
import type { WorldEventEnvelope } from '@piquet-h/shared/events'
import { inject, injectable } from 'inversify'
import type { IDeadLetterRepository } from '../../repos/deadLetterRepository.js'
import { TelemetryService } from '../../telemetry/TelemetryService.js'
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

@injectable()
export class BatchGenerateHandler extends BaseWorldEventHandler {
    readonly type = 'World.Location.BatchGenerate' as const

    constructor(
        @inject('IDeadLetterRepository') deadLetterRepo: IDeadLetterRepository,
        @inject(TelemetryService) telemetry: TelemetryService
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
     * Execute batch generate handler (stub - no world mutations yet)
     *
     * Emits lifecycle telemetry and logs placeholder for AI integration.
     * Actual location creation deferred to #761.
     */
    protected async executeHandler(event: WorldEventEnvelope, context: InvocationContext): Promise<WorldEventHandlerResult> {
        // Safe to cast after validation passes
        const payload = event.payload as unknown as BatchGeneratePayload

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

        // Placeholder log for AI integration (deferred to #761)
        context.log('BatchGenerateHandler: stub pending AI integration', {
            rootLocationId: payload.rootLocationId,
            batchSize: payload.batchSize,
            terrain: payload.terrain,
            arrivalDirection: payload.arrivalDirection,
            expansionDepth: payload.expansionDepth
        })

        // Emit Completed telemetry
        this.telemetry.trackGameEvent(
            'World.BatchGeneration.Completed',
            {
                rootLocationId: payload.rootLocationId,
                correlationId: event.correlationId
            },
            { correlationId: event.correlationId }
        )

        return {
            outcome: 'success',
            details: 'Batch generation scaffold executed (no mutations yet)'
        }
    }
}
