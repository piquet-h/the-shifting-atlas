import { injectable } from 'inversify'
import type { DescriptionLayer, IDescriptionRepository } from './descriptionRepository.js'

/**
 * Mock implementation of IDescriptionRepository for unit tests.
 * Provides predictable behavior and test control.
 */
@injectable()
export class MockDescriptionRepository implements IDescriptionRepository {
    private mockLayers = new Map<string, DescriptionLayer>()

    // Test helpers
    setLayer(layer: DescriptionLayer): void {
        this.mockLayers.set(layer.id, layer)
    }

    clear(): void {
        this.mockLayers.clear()
    }

    async getLayersForLocation(locationId: string): Promise<DescriptionLayer[]> {
        const result: DescriptionLayer[] = []
        for (const layer of this.mockLayers.values()) {
            if (layer.locationId === locationId && !layer.archived) {
                result.push(layer)
            }
        }
        return result
    }

    async addLayer(layer: DescriptionLayer): Promise<{ created: boolean; id: string }> {
        if (this.mockLayers.has(layer.id)) {
            return { created: false, id: layer.id }
        }
        this.mockLayers.set(layer.id, { ...layer })
        return { created: true, id: layer.id }
    }

    async archiveLayer(layerId: string): Promise<{ archived: boolean }> {
        const layer = this.mockLayers.get(layerId)
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
