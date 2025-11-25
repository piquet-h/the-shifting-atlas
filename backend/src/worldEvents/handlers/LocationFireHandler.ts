import type { InvocationContext } from '@azure/functions'
import { createDeadLetterRecord } from '@piquet-h/shared/deadLetter'
import type { WorldEventEnvelope } from '@piquet-h/shared/events'
import { inject, injectable } from 'inversify'
import type { IDeadLetterRepository } from '../../repos/deadLetterRepository.js'
import type { IDescriptionRepository } from '../../repos/descriptionRepository.js'
import { TelemetryService } from '../../telemetry/TelemetryService.js'
import type { IWorldEventHandler, WorldEventHandlerResult } from '../types.js'
import { v4 as uuidv4 } from 'uuid'

@injectable()
export class LocationFireHandler implements IWorldEventHandler {
    public readonly type = 'Location.Fire.Started'
    constructor(
        @inject('IDescriptionRepository') private descriptionRepo: IDescriptionRepository,
        @inject('IDeadLetterRepository') private deadLetterRepo: IDeadLetterRepository,
        @inject(TelemetryService) private telemetry: TelemetryService
    ) {}

    async handle(event: WorldEventEnvelope, context: InvocationContext): Promise<WorldEventHandlerResult> {
        const { locationId, intensity, spreadRadius } = event.payload as Record<string, unknown>

        const missing: string[] = []
        if (typeof locationId !== 'string' || !locationId) missing.push('locationId')
        if (typeof intensity !== 'string' || !intensity) missing.push('intensity')

        if (missing.length) {
            const record = createDeadLetterRecord(event, {
                category: 'handler-validation',
                message: 'Missing required fields for Location.Fire.Started',
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
                    handler: 'LocationFireHandler',
                    outcome: 'validation-failed',
                    missingCount: missing.length,
                    correlationId: event.correlationId
                },
                { correlationId: event.correlationId }
            )
            context.warn('LocationFireHandler validation failed', { missing })
            return { outcome: 'validation-failed', details: `Missing: ${missing.join(',')}` }
        }

        const validIntensities = ['low', 'moderate', 'high']
        if (!validIntensities.includes(intensity as string)) {
            const record = createDeadLetterRecord(event, {
                category: 'handler-validation',
                message: 'Invalid intensity for Location.Fire.Started',
                issues: [{ path: 'intensity', message: `Invalid intensity: ${intensity}`, code: 'invalid' }]
            })
            try {
                await this.deadLetterRepo.store(record)
            } catch (e) {
                context.error('Failed to store dead-letter for invalid intensity', { error: String(e) })
            }
            this.telemetry.trackGameEvent(
                'World.Event.HandlerInvoked',
                {
                    eventType: event.type,
                    handler: 'LocationFireHandler',
                    outcome: 'validation-failed',
                    correlationId: event.correlationId
                },
                { correlationId: event.correlationId }
            )
            context.warn('LocationFireHandler invalid intensity', { intensity })
            return { outcome: 'validation-failed', details: 'invalid-intensity' }
        }

        try {
            const layerContent = this.generateFireDescription(intensity as string)
            const layerId = uuidv4()
            const result = await this.descriptionRepo.addLayer({
                id: layerId,
                locationId: locationId as string,
                type: 'structural_event',
                content: layerContent,
                createdAt: new Date().toISOString(),
                source: 'world-event:Location.Fire.Started',
                attributes: {
                    intensity: intensity as string,
                    spreadRadius: typeof spreadRadius === 'number' ? spreadRadius : 0,
                    eventId: event.eventId
                }
            })

            const outcome: WorldEventHandlerResult = result.created
                ? { outcome: 'success', details: 'fire-layer-added' }
                : { outcome: 'noop', details: 'layer-already-existed' }

            this.telemetry.trackGameEvent(
                'World.Event.HandlerInvoked',
                {
                    eventType: event.type,
                    handler: 'LocationFireHandler',
                    outcome: outcome.outcome,
                    layerId: result.id,
                    correlationId: event.correlationId
                },
                { correlationId: event.correlationId }
            )
            context.log('LocationFireHandler applied', { locationId, intensity, layerId: result.id, created: result.created })
            return outcome
        } catch (err) {
            this.telemetry.trackGameEvent(
                'World.Event.HandlerInvoked',
                {
                    eventType: event.type,
                    handler: 'LocationFireHandler',
                    outcome: 'error',
                    errorMessage: String(err),
                    correlationId: event.correlationId
                },
                { correlationId: event.correlationId }
            )
            context.error('LocationFireHandler error', { error: String(err) })
            throw err
        }
    }

    private generateFireDescription(intensity: string): string {
        switch (intensity) {
            case 'low':
                return 'Small flames flicker along the edges, tendrils of smoke curling upward.'
            case 'moderate':
                return 'Fire crackles hungrily across the area, casting dancing shadows. Smoke thickens the air.'
            case 'high':
                return 'An inferno rages here, flames leaping high. The heat is nearly unbearable, and visibility is poor through the thick smoke.'
            default:
                return 'Fire burns here.'
        }
    }
}
