import type { InvocationContext } from '@azure/functions'
import { getOppositeDirection, isDirection } from '@piquet-h/shared'
import type { Direction } from '@piquet-h/shared'
import type { WorldEventEnvelope } from '@piquet-h/shared/events'
import { inject, injectable } from 'inversify'
import type { IDeadLetterRepository } from '../../repos/deadLetterRepository.js'
import type { ILocationRepository } from '../../repos/locationRepository.js'
import { defaultTravelDurationForDirection } from '../../handlers/utils/travelDurationHeuristics.js'
import { TelemetryService } from '../../telemetry/TelemetryService.js'
import type { WorldEventHandlerResult } from '../types.js'
import { BaseWorldEventHandler, type ValidationResult } from './base/BaseWorldEventHandler.js'

/** Handler for World.Exit.Create events */
@injectable()
export class ExitCreateHandler extends BaseWorldEventHandler {
    public readonly type = 'World.Exit.Create'

    constructor(
        @inject('ILocationRepository') private locationRepo: ILocationRepository,
        @inject('IDeadLetterRepository') deadLetterRepo: IDeadLetterRepository,
        @inject(TelemetryService) telemetry: TelemetryService
    ) {
        super(deadLetterRepo, telemetry)
    }

    /**
     * Validate payload: check required fields and direction validity
     */
    protected validatePayload(payload: unknown): ValidationResult {
        const { fromLocationId, toLocationId, direction } = payload as Record<string, unknown>

        const missing: string[] = []
        if (typeof fromLocationId !== 'string' || !fromLocationId) missing.push('fromLocationId')
        if (typeof toLocationId !== 'string' || !toLocationId) missing.push('toLocationId')
        if (typeof direction !== 'string' || !direction) missing.push('direction')

        if (missing.length) {
            return { valid: false, missing }
        }

        // Custom validation: check direction is valid
        if (!isDirection(direction as string)) {
            return {
                valid: false,
                missing: ['direction'],
                message: `Invalid direction: ${direction}`
            }
        }

        return { valid: true, missing: [] }
    }

    /**
     * Execute bidirectional exit creation
     */
    protected async executeHandler(event: WorldEventEnvelope, context: InvocationContext): Promise<WorldEventHandlerResult> {
        const { fromLocationId, toLocationId, direction, travelDurationMs, forwardDescription, backwardDescription } =
            event.payload as Record<string, unknown>
        const dir = direction as Direction

        const result = await this.locationRepo.ensureExitBidirectional(fromLocationId as string, dir, toLocationId as string, {
            reciprocal: true,
            description: typeof forwardDescription === 'string' ? forwardDescription : undefined,
            reciprocalDescription: typeof backwardDescription === 'string' ? backwardDescription : undefined
        })

        const created = result.created || result.reciprocalCreated

        // Determine the duration to apply: use payload value if valid, else derive from direction heuristic.
        const duration =
            typeof travelDurationMs === 'number' && travelDurationMs > 0 ? travelDurationMs : defaultTravelDurationForDirection(dir)

        if (result.created) {
            await this.locationRepo.setExitTravelDuration(fromLocationId as string, dir, duration)
        }
        if (result.reciprocalCreated) {
            await this.locationRepo.setExitTravelDuration(toLocationId as string, getOppositeDirection(dir), duration)
        }

        context.log('ExitCreateHandler applied', {
            fromLocationId,
            toLocationId,
            direction,
            travelDurationMs: duration,
            created
        })

        return created ? { outcome: 'success', details: 'exit-created' } : { outcome: 'noop', details: 'already-existed' }
    }
}
