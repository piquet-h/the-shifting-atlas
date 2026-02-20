/**
 * WorldEventPublisher - Publishes world events to Azure Service Bus queue
 *
 * This service is responsible for enqueueing world events to the 'world-events'
 * Service Bus queue for async processing. Events are published with correlation
 * IDs for traceability across the event cascade.
 *
 * Note: In production, this uses the Service Bus connection configured via
 * 'ServiceBusAtlas' connection string. For testing, this can be mocked.
 */

import type { ServiceBusClient } from '@azure/service-bus'
import type { WorldEventEnvelope } from '@piquet-h/shared/events'
import { inject, injectable } from 'inversify'
import { TOKENS } from '../di/tokens.js'

export const SERVICE_BUS_WORLD_EVENTS_QUEUE = 'world-events'

/**
 * Interface for publishing world events to the queue
 */
export interface IWorldEventPublisher {
    /**
     * Enqueue one or more world events to the Service Bus queue
     * @param events - Array of world event envelopes to publish
     */
    enqueueEvents(events: WorldEventEnvelope[]): Promise<void>
}

/**
 * In-memory event publisher for development and testing.
 *
 * Events can be verified in integration tests by checking the enqueuedEvents array.
 */
@injectable()
export class InMemoryWorldEventPublisher implements IWorldEventPublisher {
    public enqueuedEvents: WorldEventEnvelope[] = []

    async enqueueEvents(events: WorldEventEnvelope[]): Promise<void> {
        this.enqueuedEvents.push(...events)
    }

    /** Clear enqueued events (for test cleanup) */
    clear(): void {
        this.enqueuedEvents = []
    }
}

/**
 * Production Service Bus publisher.
 *
 * Sends WorldEventEnvelope messages to the 'world-events' queue using batch send
 * for efficiency. The correlationId is stamped both in the message body and as
 * an application property for end-to-end traceability.
 *
 * Configuration:
 * - ServiceBusAtlas__fullyQualifiedNamespace  (Managed Identity / recommended)
 * - ServiceBusAtlas                           (connection string / legacy)
 */
@injectable()
export class ServiceBusWorldEventPublisher implements IWorldEventPublisher {
    constructor(@inject(TOKENS.ServiceBusClient) private readonly client: ServiceBusClient) {}

    async enqueueEvents(events: WorldEventEnvelope[]): Promise<void> {
        if (events.length === 0) {
            return
        }

        const sender = this.client.createSender(SERVICE_BUS_WORLD_EVENTS_QUEUE)
        try {
            let currentBatch = await sender.createMessageBatch()
            for (const event of events) {
                const message = {
                    body: event,
                    correlationId: event.correlationId,
                    applicationProperties: {
                        correlationId: event.correlationId,
                        eventType: event.type
                    }
                }
                if (!currentBatch.tryAddMessage(message)) {
                    // Batch is full – flush and start a new one
                    await sender.sendMessages(currentBatch)
                    currentBatch = await sender.createMessageBatch()
                    if (!currentBatch.tryAddMessage(message)) {
                        throw new Error(`World event ${event.eventId} is too large to fit in a single Service Bus message batch`)
                    }
                }
            }
            await sender.sendMessages(currentBatch)
        } finally {
            await sender.close()
        }
    }
}
