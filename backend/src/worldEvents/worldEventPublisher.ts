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

import type { WorldEventEnvelope } from '@piquet-h/shared/events'
import { injectable } from 'inversify'

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
 * Production Implementation Note:
 * In production Azure Functions, events should be published using one of:
 * 1. Service Bus output binding (simplest, declared in function config)
 * 2. @azure/service-bus SDK client (for batch optimization)
 *
 * For now, this in-memory implementation allows handlers to be developed
 * and tested without Service Bus infrastructure. Events can be verified
 * in integration tests by checking the enqueuedEvents array.
 *
 * TODO: Implement production ServiceBusWorldEventPublisher when deploying
 */
@injectable()
export class InMemoryWorldEventPublisher implements IWorldEventPublisher {
    public enqueuedEvents: WorldEventEnvelope[] = []

    async enqueueEvents(events: WorldEventEnvelope[]): Promise<void> {
        // For now, store in memory for testing
        // In production, this would send to Service Bus
        this.enqueuedEvents.push(...events)
    }

    /** Clear enqueued events (for test cleanup) */
    clear(): void {
        this.enqueuedEvents = []
    }
}
