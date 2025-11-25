/**
 * In-memory implementation of IInventoryRepository for testing.
 * No Azure dependencies required.
 */

import type { IInventoryRepository, InventoryItem } from '@piquet-h/shared/types/inventoryRepository'
import { injectable } from 'inversify'
import { BaseMemoryRepository } from './base/BaseMemoryRepository.js'

@injectable()
export class MemoryInventoryRepository extends BaseMemoryRepository<string, InventoryItem> implements IInventoryRepository {
    async addItem(item: InventoryItem): Promise<InventoryItem> {
        const key = this.makeKey(item.id, item.playerId)

        // Validate metadata size (edge case: metadata exceeds size limit)
        if (item.metadata) {
            const metadataJson = JSON.stringify(item.metadata)
            const MAX_METADATA_SIZE = 100_000 // 100KB limit

            if (metadataJson.length > MAX_METADATA_SIZE) {
                console.warn(`Inventory metadata for item ${item.id} exceeds ${MAX_METADATA_SIZE} bytes, truncating`)
                item.metadata = { truncated: true, warning: 'Metadata exceeded size limit' }
            }
        }

        this.records.set(key, { ...item })
        return item
    }

    async removeItem(itemId: string, playerId: string): Promise<boolean> {
        const key = this.makeKey(itemId, playerId)
        const existed = this.records.has(key)

        if (existed) {
            this.records.delete(key)
        }

        return existed
    }

    async listItems(playerId: string): Promise<InventoryItem[]> {
        const playerItems: InventoryItem[] = []

        for (const item of this.records.values()) {
            if (item.playerId === playerId) {
                playerItems.push(item)
            }
        }

        // Edge case: player has 0 items -> empty result set (no placeholder)
        return playerItems
    }

    async getItem(itemId: string, playerId: string): Promise<InventoryItem | null> {
        const key = this.makeKey(itemId, playerId)
        return this.records.get(key) || null
    }

    /**
     * Get all items (for test assertions)
     */
    getAllItems(): InventoryItem[] {
        return Array.from(this.records.values())
    }

    private makeKey(itemId: string, playerId: string): string {
        return `${playerId}:${itemId}`
    }
}
