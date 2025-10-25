import { injectable } from 'inversify'
import type { DescriptionLayer, IDescriptionRepository } from './descriptionRepository.js'

/**
 * In-memory implementation of IDescriptionRepository.
 * Used for memory mode and integration tests.
 */
@injectable()
export class InMemoryDescriptionRepository implements IDescriptionRepository {
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
