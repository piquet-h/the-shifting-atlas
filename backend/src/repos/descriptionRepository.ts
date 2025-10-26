/**
 * Description repository interface for managing layered location descriptions.
 *
 * Per ADR-001: Base descriptions are immutable; all variation is additive via layers.
 * This interface defines the contract for persistence of description layers.
 *
 * STATUS: Interface defined; full implementation deferred to M4 milestone.
 */

export type DescriptionLayerType = 'structural_event' | 'ambient' | 'weather' | 'enhancement' | 'personalization'

export interface DescriptionLayer {
    id: string
    locationId: string
    type: DescriptionLayerType
    /** Short prose snippet (not a complete rewrite of base description). */
    content: string
    /** ISO timestamp when layer was created. */
    createdAt: string
    /** Optional expiry for ephemeral layers (ambient/weather). */
    expiresAt?: string
    /** Optional author/source tracking (ai-generated, player-action, etc.). */
    source?: string
    /** Layer-specific attributes (e.g., damage_level, weather_type). */
    attributes?: Record<string, string | number | boolean>
    /** If true, layer is no longer active (superseded or explicitly removed). */
    archived?: boolean
}

/**
 * Repository contract for description layer persistence.
 * Supports additive layering model without mutating base location prose.
 */
export interface IDescriptionRepository {
    /**
     * Retrieve all active (non-archived) layers for a location.
     * @param locationId - Location GUID
     * @returns Array of active layers, empty if none exist
     */
    getLayersForLocation(locationId: string): Promise<DescriptionLayer[]>

    /**
     * Add a new description layer (idempotent if layer with same id already exists).
     * @param layer - Layer to persist
     * @returns Whether a new layer was created (false if already exists)
     */
    addLayer(layer: DescriptionLayer): Promise<{ created: boolean; id: string }>

    /**
     * Archive a layer by id (mark as inactive, preserving history).
     * @param layerId - Layer GUID
     * @returns Whether layer was found and archived
     */
    archiveLayer(layerId: string): Promise<{ archived: boolean }>

    /**
     * Batch retrieve layers for multiple locations (optimization for world view assembly).
     * @param locationIds - Array of location GUIDs
     * @returns Map from locationId to array of active layers
     */
    getLayersForLocations(locationIds: string[]): Promise<Map<string, DescriptionLayer[]>>
}

// In-memory implementation for early testing (minimal storage)
class InMemoryDescriptionRepository implements IDescriptionRepository {
    private layers = new Map<string, DescriptionLayer>()

    async getLayersForLocation(locationId: string): Promise<DescriptionLayer[]> {
        const result: DescriptionLayer[] = []
        for (const layer of this.layers.values()) {
            if (layer.locationId === locationId && !layer.archived) {
                result.push(layer)
            }
        }
        return result
    }

    async addLayer(layer: DescriptionLayer): Promise<{ created: boolean; id: string }> {
        if (this.layers.has(layer.id)) {
            return { created: false, id: layer.id }
        }
        this.layers.set(layer.id, { ...layer })
        return { created: true, id: layer.id }
    }

    async archiveLayer(layerId: string): Promise<{ archived: boolean }> {
        const layer = this.layers.get(layerId)
        if (!layer) return { archived: false }
        layer.archived = true
        return { archived: true }
    }

    async getLayersForLocations(locationIds: string[]): Promise<Map<string, DescriptionLayer[]>> {
        const result = new Map<string, DescriptionLayer[]>()
        for (const locId of locationIds) {
            result.set(locId, await this.getLayersForLocation(locId))
        }
        return result
    }
}

// Legacy singleton pattern - kept for backward compatibility with old code
// New code should use dependency injection via inversify container
let singleton: IDescriptionRepository | undefined

export async function getDescriptionRepository(): Promise<IDescriptionRepository> {
    if (singleton) return singleton
    singleton = new InMemoryDescriptionRepository()
    return singleton
}

export function __resetDescriptionRepositoryForTests() {
    singleton = undefined
}
