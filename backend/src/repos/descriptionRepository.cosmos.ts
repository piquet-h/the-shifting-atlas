import { injectable } from 'inversify'
import type { DescriptionLayer, IDescriptionRepository } from './descriptionRepository.js'

/**
 * Cosmos (SQL API) implementation of IDescriptionRepository.
 *
 * STATUS: Stub implementation for future M4 milestone.
 * Currently delegates to in-memory implementation.
 * Will be replaced with Azure Cosmos SQL API integration.
 */
@injectable()
export class CosmosDescriptionRepository implements IDescriptionRepository {
    // TODO: Inject Cosmos SQL client when implementing
    private fallback = new Map<string, DescriptionLayer>()

    async getLayersForLocation(locationId: string): Promise<DescriptionLayer[]> {
        const result: DescriptionLayer[] = []
        for (const layer of this.fallback.values()) {
            if (layer.locationId === locationId && !layer.archived) {
                result.push(layer)
            }
        }
        return result
    }

    async addLayer(layer: DescriptionLayer): Promise<{ created: boolean; id: string }> {
        if (this.fallback.has(layer.id)) {
            return { created: false, id: layer.id }
        }
        this.fallback.set(layer.id, { ...layer })
        return { created: true, id: layer.id }
    }

    async archiveLayer(layerId: string): Promise<{ archived: boolean }> {
        const layer = this.fallback.get(layerId)
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
