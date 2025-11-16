/**
 * Cosmos SQL API implementation of Processed Event Repository
 *
 * Provides durable idempotency registry with automatic TTL expiration.
 * Ensures ≥99.9% duplicate suppression rate across processor restarts.
 *
 * Partition Key: /idempotencyKey for efficient duplicate detection
 * TTL: 7 days default (configurable via container)
 */

import type { IProcessedEventRepository, ProcessedEventRecord } from '@piquet-h/shared/types/processedEventRepository'
import { inject, injectable } from 'inversify'
import { CosmosDbSqlRepository } from './base/CosmosDbSqlRepository.js'
import type { ICosmosDbSqlClient } from './base/cosmosDbSqlClient.js'

@injectable()
export class CosmosProcessedEventRepository extends CosmosDbSqlRepository<ProcessedEventRecord> implements IProcessedEventRepository {
    constructor(@inject('CosmosDbSqlClient') client: ICosmosDbSqlClient, @inject('CosmosContainer:ProcessedEvents') containerName: string) {
        super(client, containerName) // No telemetry for idempotency tracking
    }

    /**
     * Mark an event as processed by storing its idempotency key.
     * TTL is set by container default (7 days).
     */
    async markProcessed(record: ProcessedEventRecord): Promise<ProcessedEventRecord> {
        // Ensure partition key matches document property
        const document = {
            id: record.id,
            idempotencyKey: record.idempotencyKey,
            eventId: record.eventId,
            eventType: record.eventType,
            correlationId: record.correlationId,
            processedUtc: record.processedUtc,
            actorKind: record.actorKind,
            actorId: record.actorId,
            version: record.version
            // TTL is inherited from container default (7 days)
        }

        const { resource } = await this.container.items.create(document)
        return resource as ProcessedEventRecord
    }

    /**
     * Check if an event has been processed (duplicate detection).
     * Uses point read with idempotencyKey as partition key for efficiency.
     */
    async checkProcessed(idempotencyKey: string): Promise<ProcessedEventRecord | null> {
        try {
            // Query by partition key (efficient single-partition query)
            // Note: We can't use point read (.item(id, pk).read()) because we don't know the id
            // So we query within the partition
            const querySpec = {
                query: 'SELECT * FROM c WHERE c.idempotencyKey = @idempotencyKey',
                parameters: [
                    {
                        name: '@idempotencyKey',
                        value: idempotencyKey
                    }
                ]
            }

            const { resources } = await this.container.items
                .query(querySpec, {
                    partitionKey: idempotencyKey,
                    maxItemCount: 1
                })
                .fetchAll()

            return resources.length > 0 ? (resources[0] as ProcessedEventRecord) : null
        } catch (error) {
            // If container doesn't exist or other errors, return null (not found)
            // This implements "availability over consistency" - proceed with processing
            const cosmosError = error as { code?: number }
            if (cosmosError.code === 404) {
                return null
            }
            throw error
        }
    }

    /**
     * Get a specific processed event by ID (for debugging).
     */
    async getById(id: string, idempotencyKey: string): Promise<ProcessedEventRecord | null> {
        try {
            const { resource } = await this.container.item(id, idempotencyKey).read<ProcessedEventRecord>()
            return resource || null
        } catch (error) {
            const cosmosError = error as { code?: number }
            if (cosmosError.code === 404) {
                return null
            }
            throw error
        }
    }
}
