import type { InvocationContext } from '@azure/functions'
import { createDeadLetterRecord } from '@piquet-h/shared/deadLetter'
import type { WorldEventEnvelope } from '@piquet-h/shared/events'
import { inject, injectable } from 'inversify'
import type { IDeadLetterRepository } from '../../repos/deadLetterRepository.js'
import { TelemetryService } from '../../telemetry/TelemetryService.js'
import type { IWorldEventHandler, WorldEventHandlerResult } from '../types.js'

/** Handler for NPC.Tick events - placeholder logic (Issue #258) */
@injectable()
export class NPCTickHandler implements IWorldEventHandler {
    public readonly type = 'NPC.Tick'
    constructor(
        @inject('IDeadLetterRepository') private deadLetterRepo: IDeadLetterRepository,
        @inject(TelemetryService) private telemetry: TelemetryService
    ) {}

    async handle(event: WorldEventEnvelope, context: InvocationContext): Promise<WorldEventHandlerResult> {
        const { npcId, locationId } = event.payload as Record<string, unknown>
        const missing: string[] = []
        if (typeof npcId !== 'string' || !npcId) missing.push('npcId')
        if (typeof locationId !== 'string' || !locationId) missing.push('locationId')

        if (missing.length) {
            const record = createDeadLetterRecord(event, {
                category: 'handler-validation',
                message: 'Missing required fields for NPC.Tick',
                issues: missing.map((f) => ({ path: f, message: 'Missing field', code: 'missing' }))
            })
            try {
                await this.deadLetterRepo.store(record)
            } catch (e) {
                context.error('Failed to store dead-letter for NPC.Tick validation', { error: String(e) })
            }
            this.telemetry.trackGameEvent(
                'World.Event.HandlerInvoked',
                {
                    eventType: event.type,
                    handler: 'NPCTickHandler',
                    outcome: 'validation-failed',
                    missingCount: missing.length,
                    correlationId: event.correlationId
                },
                { correlationId: event.correlationId }
            )
            context.warn('NPCTickHandler validation failed', { missing })
            return { outcome: 'validation-failed', details: `Missing: ${missing.join(',')}` }
        }

        // Placeholder logic: currently no world mutation (future: NPC AI decisions)
        this.telemetry.trackGameEvent(
            'World.Event.HandlerInvoked',
            {
                eventType: event.type,
                handler: 'NPCTickHandler',
                outcome: 'success',
                correlationId: event.correlationId
            },
            { correlationId: event.correlationId }
        )
        context.log('NPCTickHandler tick processed', { npcId, locationId })
        return { outcome: 'success', details: 'tick-processed' }
    }
}
