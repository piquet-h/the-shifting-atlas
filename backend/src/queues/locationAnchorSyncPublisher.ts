import type { ServiceBusClient } from '@azure/service-bus'
import { injectable } from 'inversify'

export const SERVICE_BUS_LOCATION_ANCHOR_SYNC_QUEUE = 'location-anchor-sync'

export interface LocationAnchorSyncMessage {
    worldClockTick: number
    advancementReason?: string
    correlationId: string
}

export interface ILocationAnchorSyncPublisher {
    enqueueSync(worldClockTick: number, advancementReason: string | undefined, correlationId: string): Promise<void>
}

export interface InMemoryLocationAnchorSyncPublisherOptions {
    /**
     * When true, synchronously drains queued messages via processMessage.
     * Intended for local memory-mode testing only.
     */
    autoDrain?: boolean
    /**
     * Queue message processor callback used by autodrain.
     */
    processMessage?: (message: LocationAnchorSyncMessage) => Promise<void>
}

@injectable()
export class InMemoryLocationAnchorSyncPublisher implements ILocationAnchorSyncPublisher {
    public enqueuedMessages: LocationAnchorSyncMessage[] = []
    private isDraining = false

    constructor(private readonly options: InMemoryLocationAnchorSyncPublisherOptions = {}) {
        if (options.autoDrain && !options.processMessage) {
            throw new Error('InMemoryLocationAnchorSyncPublisher autodrain requires processMessage callback')
        }
    }

    async enqueueSync(worldClockTick: number, advancementReason: string | undefined, correlationId: string): Promise<void> {
        const message: LocationAnchorSyncMessage = {
            worldClockTick,
            advancementReason,
            correlationId
        }

        this.enqueuedMessages.push(message)

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
export class ServiceBusLocationAnchorSyncPublisher implements ILocationAnchorSyncPublisher {
    constructor(private readonly client: ServiceBusClient) {}

    async enqueueSync(worldClockTick: number, advancementReason: string | undefined, correlationId: string): Promise<void> {
        const sender = this.client.createSender(SERVICE_BUS_LOCATION_ANCHOR_SYNC_QUEUE)
        try {
            await sender.sendMessages({
                body: {
                    worldClockTick,
                    advancementReason,
                    correlationId
                },
                correlationId,
                applicationProperties: {
                    correlationId,
                    eventType: 'Location.Clock.SyncRequested'
                }
            })
        } finally {
            await sender.close()
        }
    }
}
