/**
 * In-memory implementation of ILayerRepository for testing.
 * Provides fast, isolated layer storage without external dependencies.
 */

import type { DescriptionLayer } from '@piquet-h/shared/types/layerRepository'
import { injectable } from 'inversify'
import type { ILayerRepository } from './layerRepository.js'

/**
 * In-memory layer repository for testing and local development
 */
@injectable()
export class MemoryLayerRepository implements ILayerRepository {
    private layers: Map<string, DescriptionLayer> = new Map()

    async addLayer(layer: DescriptionLayer): Promise<DescriptionLayer> {
        this.layers.set(layer.id, { ...layer })
        return { ...layer }
    }

    async getLayersForLocation(locationId: string): Promise<DescriptionLayer[]> {
        const locationLayers = Array.from(this.layers.values()).filter((layer) => layer.locationId === locationId)

        // Sort by priority (descending), then by layerId (alphanumeric) for deterministic ties
        return locationLayers.sort((a, b) => {
            if (a.priority !== b.priority) {
                return b.priority - a.priority // Higher priority first
            }
            return a.id.localeCompare(b.id) // Deterministic tie resolution
        })
    }

    async updateLayer(
        layerId: string,
        locationId: string,
        updates: Partial<Pick<DescriptionLayer, 'content' | 'priority' | 'layerType'>>
    ): Promise<DescriptionLayer | null> {
        const existing = this.layers.get(layerId)

        if (!existing || existing.locationId !== locationId) {
            return null
        }

        const updated: DescriptionLayer = {
            ...existing,
            ...updates
        }

        this.layers.set(layerId, updated)
        return { ...updated }
    }

    async deleteLayer(layerId: string, locationId: string): Promise<boolean> {
        const existing = this.layers.get(layerId)

        if (!existing || existing.locationId !== locationId) {
            return false
        }

        this.layers.delete(layerId)
        return true
    }

    /**
     * Clear all layers (test utility)
     */
    clear(): void {
        this.layers.clear()
    }
}
