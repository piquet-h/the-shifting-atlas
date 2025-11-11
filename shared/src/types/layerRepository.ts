/**
 * Layer repository interface and types for SQL API persistence.
 * Partition strategy: PK = /locationId for efficient per-location layer queries.
 */

/**
 * Layer type enumeration for description layers.
 */
export type LayerType = 'base' | 'ambient' | 'dynamic'

/**
 * Description layer record stored in SQL API.
 */
export interface DescriptionLayer {
    /** Unique layer identifier (GUID) */
    id: string

    /** Location ID (partition key) */
    locationId: string

    /** Layer type: base (permanent), ambient (contextual), dynamic (event-driven) */
    layerType: LayerType

    /** Text content of the layer */
    content: string

    /** Priority for layer composition (higher = appears first) */
    priority: number

    /** ISO 8601 timestamp when layer was authored/created */
    authoredAt: string
}

/**
 * Repository interface for description layer persistence operations.
 */
export interface ILayerRepository {
    /**
     * Add a layer to a location (creates new layer).
     * @param layer - Description layer to add
     * @returns The created layer
     */
    addLayer(layer: DescriptionLayer): Promise<DescriptionLayer>

    /**
     * Get all layers for a location (single-partition query).
     * Layers are returned in priority order (highest first).
     * Ties are resolved by layerId (alphanumeric sort).
     * @param locationId - Location ID (partition key)
     * @returns Array of description layers sorted by priority
     */
    getLayersForLocation(locationId: string): Promise<DescriptionLayer[]>

    /**
     * Update layer content (replace in-place).
     * @param layerId - Unique layer ID
     * @param locationId - Location ID (partition key)
     * @param updates - Partial layer updates (content, priority, etc.)
     * @returns The updated layer or null if not found
     */
    updateLayer(
        layerId: string,
        locationId: string,
        updates: Partial<Pick<DescriptionLayer, 'content' | 'priority' | 'layerType'>>
    ): Promise<DescriptionLayer | null>

    /**
     * Delete a layer by ID.
     * @param layerId - Unique layer ID
     * @param locationId - Location ID (partition key)
     * @returns True if layer was deleted, false if not found
     */
    deleteLayer(layerId: string, locationId: string): Promise<boolean>
}
