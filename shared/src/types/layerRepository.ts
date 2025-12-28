/**
 * Layer repository interface and types for SQL API persistence.
 * Partition strategy: PK = /scopeId for realm-aware layer queries.
 * Scope patterns: 'loc:<locationId>' for location-specific, 'realm:<realmId>' for realm-scoped.
 */

/**
 * Layer type enumeration for description layers.
 */
export type LayerType = 'base' | 'ambient' | 'dynamic' | 'weather' | 'lighting'

/**
 * Scope identifier patterns for description layers.
 * - 'loc:<locationId>' - Location-specific layer (highest priority)
 * - 'realm:<realmId>' - Realm-scoped layer (inherited by contained locations)
 */
export type ScopeId = string

/**
 * Description layer record stored in SQL API.
 * Supports temporal validity and realm-based inheritance.
 */
export interface DescriptionLayer {
    /** Unique layer identifier (GUID) */
    id: string

    /** Scope ID (partition key): 'loc:<locationId>' or 'realm:<realmId>' */
    scopeId: ScopeId

    /** Layer type: base (permanent), ambient (contextual), dynamic (event-driven), weather, lighting */
    layerType: LayerType

    /** Text content of the layer */
    value: string

    /** World clock tick when layer becomes active */
    effectiveFromTick: number

    /** World clock tick when layer expires (null = indefinite) */
    effectiveToTick: number | null

    /** ISO 8601 timestamp when layer was authored/created */
    authoredAt: string

    /** Optional metadata for filtering and context */
    metadata?: Record<string, unknown>

    /**
     * @deprecated Use scopeId with 'loc:<locationId>' pattern instead
     */
    locationId?: string

    /**
     * @deprecated Use value instead
     */
    content?: string

    /**
     * @deprecated Use effectiveFromTick/effectiveToTick for temporal ordering instead
     */
    priority?: number
}

/**
 * Repository interface for description layer persistence operations.
 * Supports realm-based scope inheritance with location-specific overrides.
 */
export interface ILayerRepository {
    /**
     * Get the active layer for a location at a specific tick, with realm inheritance.
     * Resolution priority:
     * 1. Location-specific layer (scopeId: 'loc:<locationId>')
     * 2. Containing weather zone realm (scopeId: 'realm:<weatherZoneId>')
     * 3. Broader containing realms (ordered by scope: LOCAL → REGIONAL → MACRO → CONTINENTAL → GLOBAL)
     *
     * @param locationId - Location ID to resolve layers for
     * @param layerType - Type of layer to retrieve
     * @param tick - World clock tick for temporal filtering
     * @returns Active layer or null if none found
     */
    getActiveLayerForLocation(locationId: string, layerType: LayerType, tick: number): Promise<DescriptionLayer | null>

    /**
     * Set a layer for an entire realm (e.g., zone-wide weather).
     * All locations within the realm will inherit this layer unless overridden.
     *
     * @param realmId - Realm ID to scope the layer to
     * @param layerType - Type of layer
     * @param fromTick - World clock tick when layer becomes active
     * @param toTick - World clock tick when layer expires (null = indefinite)
     * @param value - Text content of the layer
     * @param metadata - Optional metadata
     * @returns The created layer
     */
    setLayerForRealm(
        realmId: string,
        layerType: LayerType,
        fromTick: number,
        toTick: number | null,
        value: string,
        metadata?: Record<string, unknown>
    ): Promise<DescriptionLayer>

    /**
     * Set a location-specific layer that overrides realm layers.
     * This layer takes precedence over any realm-scoped layers.
     *
     * @param locationId - Location ID to scope the layer to
     * @param layerType - Type of layer
     * @param fromTick - World clock tick when layer becomes active
     * @param toTick - World clock tick when layer expires (null = indefinite)
     * @param value - Text content of the layer
     * @param metadata - Optional metadata
     * @returns The created layer
     */
    setLayerForLocation(
        locationId: string,
        layerType: LayerType,
        fromTick: number,
        toTick: number | null,
        value: string,
        metadata?: Record<string, unknown>
    ): Promise<DescriptionLayer>

    /**
     * @deprecated Use getActiveLayerForLocation instead
     * Get all layers for a location (single-partition query).
     * @param locationId - Location ID (partition key)
     * @returns Array of description layers
     */
    getLayersForLocation(locationId: string): Promise<DescriptionLayer[]>

    /**
     * @deprecated Use setLayerForLocation or setLayerForRealm instead
     * Add a layer (creates new layer).
     * @param layer - Description layer to add
     * @returns The created layer
     */
    addLayer(layer: DescriptionLayer): Promise<DescriptionLayer>

    /**
     * @deprecated Direct updates not supported in temporal model
     * Update layer content (replace in-place).
     * @param layerId - Unique layer ID
     * @param scopeId - Scope ID (partition key)
     * @param updates - Partial layer updates
     * @returns The updated layer or null if not found
     */
    updateLayer(layerId: string, scopeId: string, updates: Partial<Pick<DescriptionLayer, 'value' | 'layerType'>>): Promise<DescriptionLayer | null>

    /**
     * Delete a layer by ID.
     * @param layerId - Unique layer ID
     * @param scopeId - Scope ID (partition key)
     * @returns True if layer was deleted, false if not found
     */
    deleteLayer(layerId: string, scopeId: string): Promise<boolean>
}
