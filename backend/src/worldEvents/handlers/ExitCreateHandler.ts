import type { InvocationContext } from '@azure/functions'
import { isDirection } from '@piquet-h/shared'
import { createDeadLetterRecord } from '@piquet-h/shared/deadLetter'
import type { WorldEventEnvelope } from '@piquet-h/shared/events'
import { inject, injectable } from 'inversify'
import type { IDeadLetterRepository } from '../../repos/deadLetterRepository.js'
import type { ILocationRepository } from '../../repos/locationRepository.js'
import { TelemetryService } from '../../telemetry/TelemetryService.js'
import type { IWorldEventHandler, WorldEventHandlerResult } from '../types.js'

/** Handler for World.Exit.Create events */
@injectable()
export class ExitCreateHandler implements IWorldEventHandler {
    public readonly type = 'World.Exit.Create'
    constructor(
        @inject('ILocationRepository') private locationRepo: ILocationRepository,
        @inject('IDeadLetterRepository') private deadLetterRepo: IDeadLetterRepository,
        @inject(TelemetryService) private telemetry: TelemetryService
    ) {}

    async handle(event: WorldEventEnvelope, context: InvocationContext): Promise<WorldEventHandlerResult> {
        // Basic payload shape
        const { fromLocationId, toLocationId, direction } = event.payload as Record<string, unknown>

        // Validate payload fields
        const missing: string[] = []
        if (typeof fromLocationId !== 'string' || !fromLocationId) missing.push('fromLocationId')
        if (typeof toLocationId !== 'string' || !toLocationId) missing.push('toLocationId')
        if (typeof direction !== 'string' || !direction) missing.push('direction')

        if (missing.length) {
            const record = createDeadLetterRecord(event, {
                category: 'handler-validation',
                message: 'Missing required fields for World.Exit.Create',
                issues: missing.map((f) => ({ path: f, message: 'Missing field', code: 'missing' }))
            })
            try {
                await this.deadLetterRepo.store(record)
            } catch (e) {
                context.error('Failed to store dead-letter for handler validation failure', { error: String(e) })
            }
            // Use non-strict emission until shared package version with new event name is published
            this.telemetry.trackGameEvent(
                'World.Event.HandlerInvoked',
                {
                    eventType: event.type,
                    handler: 'ExitCreateHandler',
                    outcome: 'validation-failed',
                    missingCount: missing.length,
                    correlationId: event.correlationId
                },
                { correlationId: event.correlationId }
            )
            context.warn('ExitCreateHandler validation failed', { missing })
            return { outcome: 'validation-failed', details: `Missing: ${missing.join(',')}` }
        }

        if (!isDirection(direction as string)) {
            const record = createDeadLetterRecord(event, {
                category: 'handler-validation',
                message: 'Invalid direction for World.Exit.Create',
                issues: [
                    {
                        path: 'direction',
                        message: `Invalid direction: ${direction}`,
                        code: 'invalid'
                    }
                ]
            })
            try {
                await this.deadLetterRepo.store(record)
            } catch (e) {
                context.error('Failed to store dead-letter for invalid direction', { error: String(e) })
            }
            this.telemetry.trackGameEvent(
                'World.Event.HandlerInvoked',
                {
                    eventType: event.type,
                    handler: 'ExitCreateHandler',
                    outcome: 'validation-failed',
                    correlationId: event.correlationId
                },
                { correlationId: event.correlationId }
            )
            context.warn('ExitCreateHandler invalid direction', { direction })
            return { outcome: 'validation-failed', details: 'invalid-direction' }
        }

        // Apply domain mutation (bidirectional ensure; assumes reciprocal true for shared world effect)
        try {
            const result = await this.locationRepo.ensureExitBidirectional(
                fromLocationId as string,
                direction as string,
                toLocationId as string,
                { reciprocal: true }
            )
            const created = result.created || result.reciprocalCreated
            const outcome: WorldEventHandlerResult = created
                ? { outcome: 'success', details: created ? 'exit-created' : 'exit-existed' }
                : { outcome: 'noop', details: 'already-existed' }

            this.telemetry.trackGameEvent(
                'World.Event.HandlerInvoked',
                {
                    eventType: event.type,
                    handler: 'ExitCreateHandler',
                    outcome: outcome.outcome,
                    correlationId: event.correlationId
                },
                { correlationId: event.correlationId }
            )
            context.log('ExitCreateHandler applied', {
                fromLocationId,
                toLocationId,
                direction,
                created
            })
            return outcome
        } catch (err) {
            // Transient error - bubble to trigger retry
            this.telemetry.trackGameEvent(
                'World.Event.HandlerInvoked',
                {
                    eventType: event.type,
                    handler: 'ExitCreateHandler',
                    outcome: 'error',
                    errorMessage: String(err),
                    correlationId: event.correlationId
                },
                { correlationId: event.correlationId }
            )
            context.error('ExitCreateHandler error', { error: String(err) })
            throw err
        }
    }
}
