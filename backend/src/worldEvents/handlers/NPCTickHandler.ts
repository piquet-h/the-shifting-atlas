import type { InvocationContext } from '@azure/functions'
import type { WorldEventEnvelope } from '@piquet-h/shared/events'
import { inject, injectable } from 'inversify'
import type { IDeadLetterRepository } from '../../repos/deadLetterRepository.js'
import { TelemetryService } from '../../telemetry/TelemetryService.js'
import type { WorldEventHandlerResult } from '../types.js'
import { BaseWorldEventHandler, type ValidationResult } from './base/BaseWorldEventHandler.js'

/** Handler for NPC.Tick events - placeholder logic (Issue #258) */
@injectable()
export class NPCTickHandler extends BaseWorldEventHandler {
    public readonly type = 'NPC.Tick'

    constructor(
        @inject('IDeadLetterRepository') deadLetterRepo: IDeadLetterRepository,
        @inject(TelemetryService) telemetry: TelemetryService
    ) {
        super(deadLetterRepo, telemetry)
    }

    /**
     * Validate payload: check required fields
     */
    protected validatePayload(payload: unknown): ValidationResult {
        const { npcId, locationId } = payload as Record<string, unknown>

        const missing: string[] = []
        if (typeof npcId !== 'string' || !npcId) missing.push('npcId')
        if (typeof locationId !== 'string' || !locationId) missing.push('locationId')

        return missing.length ? { valid: false, missing } : { valid: true, missing: [] }
    }

    /**
     * Execute NPC tick logic (placeholder - future: AI decisions)
     */
    protected async executeHandler(event: WorldEventEnvelope, context: InvocationContext): Promise<WorldEventHandlerResult> {
        const { npcId, locationId } = event.payload as Record<string, unknown>

        // Placeholder logic: currently no world mutation (future: NPC AI decisions)
        context.log('NPCTickHandler tick processed', { npcId, locationId })

        return { outcome: 'success', details: 'tick-processed' }
    }
}
