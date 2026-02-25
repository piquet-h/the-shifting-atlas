import type { ServiceBusClient } from '@azure/service-bus'
import type { ExitGenerationHintPayload, WorldEventEnvelope } from '@piquet-h/shared/events'
import { buildExitHintIdempotencyKey } from '@piquet-h/shared/events'
import { injectable } from 'inversify'
import { v4 as uuidv4 } from 'uuid'

export const SERVICE_BUS_EXIT_GENERATION_HINTS_QUEUE = 'exit-generation-hints'

export interface IExitGenerationHintPublisher {
    enqueueHint(payload: ExitGenerationHintPayload, correlationId: string): Promise<void>
}

export interface InMemoryExitGenerationHintPublisherOptions {
    /**
     * When true, synchronously drains queued hint events via processMessage.
     * Intended for local memory-mode testing only.
     */
    autoDrain?: boolean
    /**
     * Message processor callback used by autodrain.
     */
    processMessage?: (message: WorldEventEnvelope) => Promise<void>
}

@injectable()
export class InMemoryExitGenerationHintPublisher implements IExitGenerationHintPublisher {
    public enqueuedMessages: WorldEventEnvelope[] = []
    private isDraining = false

    constructor(private readonly options: InMemoryExitGenerationHintPublisherOptions = {}) {
        if (options.autoDrain && !options.processMessage) {
            throw new Error('InMemoryExitGenerationHintPublisher autodrain requires processMessage callback')
        }
    }

    async enqueueHint(payload: ExitGenerationHintPayload, correlationId: string): Promise<void> {
        const envelope: WorldEventEnvelope = {
            eventId: uuidv4(),
            type: 'Navigation.Exit.GenerationHint',
            occurredUtc: new Date().toISOString(),
            actor: { kind: 'player', id: payload.playerId },
            correlationId,
            idempotencyKey: buildExitHintIdempotencyKey(payload.originLocationId, payload.dir),
            version: 1,
            payload
        }

        this.enqueuedMessages.push(envelope)

        if (this.options.autoDrain) {
            await this.drain()
        }
    }

    private async drain(): Promise<void> {
        if (this.isDraining) {
            return
        }

        this.isDraining = true
        try {
            while (this.enqueuedMessages.length > 0) {
                const message = this.enqueuedMessages.shift()!
                try {
                    await this.options.processMessage!(message)
                } catch (error) {
                    this.enqueuedMessages.unshift(message)
                    throw error
                }
            }
        } finally {
            this.isDraining = false
        }
    }
}

@injectable()
export class ServiceBusExitGenerationHintPublisher implements IExitGenerationHintPublisher {
    constructor(private readonly client: ServiceBusClient) {}

    async enqueueHint(payload: ExitGenerationHintPayload, correlationId: string): Promise<void> {
        const envelope: WorldEventEnvelope = {
            eventId: uuidv4(),
            type: 'Navigation.Exit.GenerationHint',
            occurredUtc: new Date().toISOString(),
            actor: { kind: 'player', id: payload.playerId },
            correlationId,
            idempotencyKey: buildExitHintIdempotencyKey(payload.originLocationId, payload.dir),
            version: 1,
            payload
        }

        const sender = this.client.createSender(SERVICE_BUS_EXIT_GENERATION_HINTS_QUEUE)
        try {
            await sender.sendMessages({
                body: envelope,
                correlationId,
                applicationProperties: {
                    correlationId,
                    eventType: envelope.type
                }
            })
        } finally {
            await sender.close()
        }
    }
}
