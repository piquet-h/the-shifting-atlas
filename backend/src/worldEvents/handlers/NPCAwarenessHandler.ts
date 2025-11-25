import type { InvocationContext } from '@azure/functions'
import { createDeadLetterRecord } from '@piquet-h/shared/deadLetter'
import type { WorldEventEnvelope } from '@piquet-h/shared/events'
import { inject, injectable } from 'inversify'
import type { IDeadLetterRepository } from '../../repos/deadLetterRepository.js'
import { TelemetryService } from '../../telemetry/TelemetryService.js'
import type { IWorldEventHandler, WorldEventHandlerResult } from '../types.js'

@injectable()
export class NPCAwarenessHandler implements IWorldEventHandler {
    public readonly type = 'NPC.Awareness'
    constructor(
        @inject('IDeadLetterRepository') private deadLetterRepo: IDeadLetterRepository,
        @inject(TelemetryService) private telemetry: TelemetryService
    ) {}

    async handle(event: WorldEventEnvelope, context: InvocationContext): Promise<WorldEventHandlerResult> {
        const { npcId, locationId, triggeredByPlayerId, reason } = event.payload as Record<string, unknown>

        const missing: string[] = []
        if (typeof npcId !== 'string' || !npcId) missing.push('npcId')
        if (typeof locationId !== 'string' || !locationId) missing.push('locationId')

        if (missing.length) {
            const record = createDeadLetterRecord(event, {
                category: 'handler-validation',
                message: 'Missing required fields for NPC.Awareness',
                issues: missing.map((f) => ({ path: f, message: 'Missing field', code: 'missing' }))
            })
            try {
                await this.deadLetterRepo.store(record)
            } catch (e) {
                context.error('Failed to store dead-letter for NPC.Awareness validation', { error: String(e) })
            }
            this.telemetry.trackGameEvent(
                'World.Event.HandlerInvoked',
                {
                    eventType: event.type,
                    handler: 'NPCAwarenessHandler',
                    outcome: 'validation-failed',
                    missingCount: missing.length,
                    correlationId: event.correlationId
                },
                { correlationId: event.correlationId }
            )
            context.warn('NPCAwarenessHandler validation failed', { missing })
            return { outcome: 'validation-failed', details: `Missing: ${missing.join(',')}` }
        }

        this.telemetry.trackGameEvent(
            'World.Event.HandlerInvoked',
            {
                eventType: event.type,
                handler: 'NPCAwarenessHandler',
                outcome: 'success',
                npcId: npcId as string,
                locationId: locationId as string,
                triggeredByPlayerId: (triggeredByPlayerId as string) || undefined,
                reason: (reason as string) || undefined,
                correlationId: event.correlationId
            },
            { correlationId: event.correlationId }
        )
        context.log('NPCAwarenessHandler processed', { npcId, locationId, triggeredByPlayerId, reason })
        return { outcome: 'success', details: 'awareness-processed' }
    }
}
