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
import { injectable } from 'inversify'

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

export interface InMemoryWorldEventPublisherOptions {
    /**
     * When true, synchronously drains queued events via processEvent.
     * Intended for local memory-mode testing only.
     */
    autoDrain?: boolean
    /**
     * Event processor callback used by autodrain.
     */
    processEvent?: (event: WorldEventEnvelope) => Promise<void>
}

/**
 * In-memory event publisher for development and testing.
 *
 * Events can be verified in integration tests by checking the enqueuedEvents array.
 */
@injectable()
export class InMemoryWorldEventPublisher implements IWorldEventPublisher {
    public enqueuedEvents: WorldEventEnvelope[] = []
    private isDraining = false

    constructor(private readonly options: InMemoryWorldEventPublisherOptions = {}) {
        if (options.autoDrain && !options.processEvent) {
            throw new Error('InMemoryWorldEventPublisher autodrain requires processEvent callback')
        }
    }

    async enqueueEvents(events: WorldEventEnvelope[]): Promise<void> {
        if (events.length === 0) {
            return
        }

        this.enqueuedEvents.push(...events)

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
            // FIFO drain; events enqueued during processing are appended and
            // processed in the same drain cycle.
            while (this.enqueuedEvents.length > 0) {
                const event = this.enqueuedEvents.shift()!
                try {
                    await this.options.processEvent!(event)
                } catch (error) {
                    // Preserve queue state for retry/debug by restoring the
                    // failed event at the head and bubbling the error.
                    this.enqueuedEvents.unshift(event)
                    throw error
                }
            }
        } finally {
            this.isDraining = false
        }
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
 *
 * Design note – SDK vs. Azure Functions output bindings:
 * Azure Functions v4 output bindings (`output.serviceBusQueue` / `context.extraOutputs.set`)
 * were evaluated and ruled out for this service:
 *
 *  1. **Call-site mismatch**: `enqueueEvents` is invoked from `MoveHandler.performMove()`,
 *     which does not receive `InvocationContext`. Output bindings require `context.extraOutputs.set`
 *     at the call site; threading context down to the publisher would couple domain handlers to
 *     the Azure Functions runtime.
 *
 *  2. **Cross-function publishing**: the publisher is consumed by both HTTP handlers
 *     (`PlayerMove`) and Service Bus handlers (`BatchGenerateHandler`). Output bindings are
 *     declared per-function registration, so a single binding object cannot be shared across
 *     functions via DI.
 *
 *  3. **Testability**: `InMemoryWorldEventPublisher` gives hermetic unit tests with no Azure
 *     Functions context dependency. Output-binding-based publishing would require an
 *     `InvocationContext` mock with `extraOutputs` support in every test.
 *
 *  4. **Fire-and-forget semantics**: the prefetch publish in `MoveHandler` is wrapped in
 *     try/catch and must not block the HTTP response. Output bindings are synchronous with
 *     the function return, changing failure semantics.
 *
 * The SDK approach keeps the domain layer infrastructure-agnostic while delivering the same
 * batch-send efficiency.
 */
@injectable()
export class ServiceBusWorldEventPublisher implements IWorldEventPublisher {
    constructor(private readonly client: ServiceBusClient) {}

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
