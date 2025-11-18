/**
 * Cosmos SQL API implementation of IInventoryRepository.
 * Uses partition key /playerId for efficient single-player queries.
 *
 * Container: inventory
 * Partition Key: /playerId
 * Goal: ≥90% queries target single partition; p95 latency ≤100ms
 */

import type { IInventoryRepository, InventoryItem } from '@piquet-h/shared/types/inventoryRepository'
import { inject, injectable } from 'inversify'
import { TelemetryService } from '../telemetry/TelemetryService.js'
import { CosmosDbSqlRepository } from './base/CosmosDbSqlRepository.js'
import type { ICosmosDbSqlClient } from './base/cosmosDbSqlClient.js'

/**
 * SQL API document schema for inventory items
 */
interface InventoryDocument extends InventoryItem {
    id: string
    playerId: string
    itemType: string
    quantity: number
    acquiredAt: string
    metadata?: Record<string, unknown>
}

@injectable()
export class CosmosInventoryRepository extends CosmosDbSqlRepository<InventoryDocument> implements IInventoryRepository {
    constructor(
        @inject('CosmosDbSqlClient') sqlClient: ICosmosDbSqlClient,
        protected telemetryService: TelemetryService
    ) {
        super(sqlClient, 'inventory')
    }

    async addItem(item: InventoryItem): Promise<InventoryItem> {
        const startTime = Date.now()

        // Validate metadata size (edge case: metadata exceeds size limit)
        const metadataJson = item.metadata ? JSON.stringify(item.metadata) : '{}'
        const MAX_METADATA_SIZE = 100_000 // 100KB limit

        let truncatedMetadata = item.metadata
        if (metadataJson.length > MAX_METADATA_SIZE) {
            console.warn(`Inventory metadata for item ${item.id} exceeds ${MAX_METADATA_SIZE} bytes, truncating`)
            truncatedMetadata = { truncated: true, warning: 'Metadata exceeded size limit' }
        }

        const doc: InventoryDocument = {
            id: item.id,
            playerId: item.playerId,
            itemType: item.itemType,
            quantity: item.quantity,
            acquiredAt: item.acquiredAt,
            metadata: truncatedMetadata
        }

        // Use upsert to handle create or update
        const { resource } = await this.upsert(doc)

        this.telemetryService.trackGameEvent('Inventory.AddItem', {
            playerId: item.playerId,
            itemId: item.id,
            itemType: item.itemType,
            quantity: item.quantity,
            latencyMs: Date.now() - startTime
        })

        return resource
    }

    async removeItem(itemId: string, playerId: string): Promise<boolean> {
        const startTime = Date.now()

        // Delete the item document
        const deleted = await this.delete(itemId, playerId)

        this.telemetryService.trackGameEvent('Inventory.RemoveItem', {
            playerId,
            itemId,
            deleted,
            latencyMs: Date.now() - startTime
        })

        return deleted
    }

    async listItems(playerId: string): Promise<InventoryItem[]> {
        const startTime = Date.now()

        // Single-partition query (efficient)
        const queryText = 'SELECT * FROM c WHERE c.playerId = @playerId'
        const parameters = [{ name: '@playerId', value: playerId }]

        const { items } = await this.query(queryText, parameters)

        this.telemetryService.trackGameEvent('Inventory.ListItems', {
            playerId,
            itemCount: items.length,
            latencyMs: Date.now() - startTime
        })

        // Edge case: player has 0 items -> empty result set (no placeholder)
        return items
    }

    async getItem(itemId: string, playerId: string): Promise<InventoryItem | null> {
        const startTime = Date.now()

        const item = await this.getById(itemId, playerId)

        this.telemetryService.trackGameEvent('Inventory.GetItem', {
            playerId,
            itemId,
            found: item !== null,
            latencyMs: Date.now() - startTime
        })

        return item
    }
}
