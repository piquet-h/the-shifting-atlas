import type { InvocationContext } from '@azure/functions'
import { createDeadLetterRecord } from '@piquet-h/shared/deadLetter'
import type { WorldEventEnvelope } from '@piquet-h/shared/events'
import { inject, injectable } from 'inversify'
import { v4 as uuidv4 } from 'uuid'
import type { IDeadLetterRepository } from '../../repos/deadLetterRepository.js'
import type { IDescriptionRepository } from '../../repos/descriptionRepository.js'
import { TelemetryService } from '../../telemetry/TelemetryService.js'
import type { IWorldEventHandler, WorldEventHandlerResult } from '../types.js'

/**
 * Generic handler for Location.Environment.Changed events.
 *
 * Design Philosophy (per tenets.md #7):
 * - Deterministic code captures WHAT changed (structured metadata)
 * - AI generates HOW to describe it (narrative immersion)
 *
 * This handler stores environment change metadata as a description layer.
 * When players LOOK at the location, AI uses the metadata to generate
 * contextual, immersive descriptions.
 *
 * Example payload:
 * {
 *   locationId: "loc-forest",
 *   changeType: "fire",
 *   severity: "moderate",
 *   description: "Fire has broken out",  // AI prompt context
 *   duration: "temporary",               // "temporary" | "permanent"
 *   expiresAt: "2025-11-26T00:00:00Z"    // Optional TTL
 * }
 */
@injectable()
export class EnvironmentChangeHandler implements IWorldEventHandler {
    public readonly type = 'Location.Environment.Changed'
    constructor(
        @inject('IDescriptionRepository') private descriptionRepo: IDescriptionRepository,
        @inject('IDeadLetterRepository') private deadLetterRepo: IDeadLetterRepository,
        @inject(TelemetryService) private telemetry: TelemetryService
    ) {}

    async handle(event: WorldEventEnvelope, context: InvocationContext): Promise<WorldEventHandlerResult> {
        const { locationId, changeType, severity, description, duration, expiresAt } = event.payload as Record<string, unknown>

        const missing: string[] = []
        if (typeof locationId !== 'string' || !locationId) missing.push('locationId')
        if (typeof changeType !== 'string' || !changeType) missing.push('changeType')

        if (missing.length) {
            const record = createDeadLetterRecord(event, {
                category: 'handler-validation',
                message: 'Missing required fields for Location.Environment.Changed',
                issues: missing.map((f) => ({ path: f, message: 'Missing field', code: 'missing' }))
            })
            try {
                await this.deadLetterRepo.store(record)
            } catch (e) {
                context.error('Failed to store dead-letter for handler validation failure', { error: String(e) })
            }
            this.telemetry.trackGameEvent(
                'World.Event.HandlerInvoked',
                {
                    eventType: event.type,
                    handler: 'EnvironmentChangeHandler',
                    outcome: 'validation-failed',
                    missingCount: missing.length,
                    correlationId: event.correlationId
                },
                { correlationId: event.correlationId }
            )
            context.warn('EnvironmentChangeHandler validation failed', { missing })
            return { outcome: 'validation-failed', details: `Missing: ${missing.join(',')}` }
        }

        try {
            const layerId = uuidv4()
            const result = await this.descriptionRepo.addLayer({
                id: layerId,
                locationId: locationId as string,
                type: 'structural_event',
                content: typeof description === 'string' ? description : `Environment change: ${changeType}`,
                createdAt: new Date().toISOString(),
                expiresAt: typeof expiresAt === 'string' ? expiresAt : undefined,
                source: `world-event:${event.type}`,
                attributes: {
                    changeType: changeType as string,
                    severity: typeof severity === 'string' ? severity : 'moderate',
                    duration: typeof duration === 'string' ? duration : 'temporary',
                    eventId: event.eventId
                }
            })

            const outcome: WorldEventHandlerResult = result.created
                ? { outcome: 'success', details: 'environment-layer-added' }
                : { outcome: 'noop', details: 'layer-already-existed' }

            this.telemetry.trackGameEvent(
                'World.Event.HandlerInvoked',
                {
                    eventType: event.type,
                    handler: 'EnvironmentChangeHandler',
                    outcome: outcome.outcome,
                    changeType: changeType as string,
                    layerId: result.id,
                    correlationId: event.correlationId
                },
                { correlationId: event.correlationId }
            )
            context.log('EnvironmentChangeHandler applied', {
                locationId,
                changeType,
                severity,
                layerId: result.id,
                created: result.created
            })
            return outcome
        } catch (err) {
            this.telemetry.trackGameEvent(
                'World.Event.HandlerInvoked',
                {
                    eventType: event.type,
                    handler: 'EnvironmentChangeHandler',
                    outcome: 'error',
                    errorMessage: String(err),
                    correlationId: event.correlationId
                },
                { correlationId: event.correlationId }
            )
            context.error('EnvironmentChangeHandler error', { error: String(err) })
            throw err
        }
    }
}
