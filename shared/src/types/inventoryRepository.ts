/**
 * Inventory repository interface and types for SQL API persistence.
 * Partition strategy: PK = /playerId for efficient per-player queries.
 */

/**
 * Inventory item record stored in SQL API.
 */
export interface InventoryItem {
    /** Unique item identifier (GUID) */
    id: string

    /** Player ID (partition key) */
    playerId: string

    /** Item type/category identifier */
    itemType: string

    /** Quantity of this item */
    quantity: number

    /** ISO 8601 timestamp when item was acquired */
    acquiredAt: string

    /** Flexible metadata for item-specific properties */
    metadata?: Record<string, unknown>
}

/**
 * Repository interface for inventory persistence operations.
 */
export interface IInventoryRepository {
    /**
     * Add an item to player inventory (creates new or updates quantity).
     * @param item - Inventory item to add
     * @returns The created/updated item
     */
    addItem(item: InventoryItem): Promise<InventoryItem>

    /**
     * Remove an item from inventory by ID.
     * If quantity becomes 0, the document is removed.
     * @param itemId - Unique item ID
     * @param playerId - Player ID (partition key)
     * @returns True if item was removed, false if not found
     */
    removeItem(itemId: string, playerId: string): Promise<boolean>

    /**
     * List all items for a player (single-partition query).
     * @param playerId - Player ID (partition key)
     * @returns Array of inventory items
     */
    listItems(playerId: string): Promise<InventoryItem[]>

    /**
     * Get a specific item by ID.
     * @param itemId - Unique item ID
     * @param playerId - Player ID (partition key)
     * @returns The item or null if not found
     */
    getItem(itemId: string, playerId: string): Promise<InventoryItem | null>
}
