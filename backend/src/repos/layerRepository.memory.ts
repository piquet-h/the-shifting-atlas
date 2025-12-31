/**
 * In-memory implementation of ILayerRepository for testing.
 * Provides fast, isolated layer storage without external dependencies.
 * Supports realm-based scope inheritance with location-specific overrides.
 */

import type { DescriptionLayer, LayerType } from '@piquet-h/shared/types/layerRepository'
import { injectable, inject, optional } from 'inversify'
import type { ILayerRepository } from './layerRepository.js'
import type { IRealmRepository } from './realmRepository.js'

/**
 * In-memory layer repository for testing and local development
 */
@injectable()
export class MemoryLayerRepository implements ILayerRepository {
    private layers: Map<string, DescriptionLayer> = new Map()
    private realmRepository?: IRealmRepository

    constructor(@inject('IRealmRepository') @optional() realmRepository?: IRealmRepository) {
        this.realmRepository = realmRepository
    }

    async getActiveLayerForLocation(locationId: string, layerType: LayerType, tick: number): Promise<DescriptionLayer | null> {
        // Priority 1: Location-specific layer
        const locationScopeId = `loc:${locationId}`
        const locationLayer = this.findActiveLayer(locationScopeId, layerType, tick)
        if (locationLayer) {
            return locationLayer
        }

        // Priority 2+: Realm hierarchy (weather zone, then broader realms)
        if (this.realmRepository) {
            try {
                // Get containment chain for location
                const containingRealms = await this.realmRepository.getContainmentChain(locationId)

                // Sort by scope (LOCAL → REGIONAL → MACRO → CONTINENTAL → GLOBAL)
                const scopeOrder = ['LOCAL', 'REGIONAL', 'MACRO', 'CONTINENTAL', 'GLOBAL']
                containingRealms.sort((a, b) => {
                    const aIndex = scopeOrder.indexOf(a.scope)
                    const bIndex = scopeOrder.indexOf(b.scope)
                    return aIndex - bIndex
                })

                // Search realms in priority order
                for (const realm of containingRealms) {
                    const realmScopeId = `realm:${realm.id}`
                    const realmLayer = this.findActiveLayer(realmScopeId, layerType, tick)
                    if (realmLayer) {
                        return realmLayer
                    }
                }
            } catch (error) {
                // If realm lookup fails, return null (no realm layers available)
                console.warn(`[MemoryLayerRepository] Realm lookup failed for location ${locationId}:`, error)
            }
        }

        return null
    }

    async setLayerForRealm(
        realmId: string,
        layerType: LayerType,
        fromTick: number,
        toTick: number | null,
        value: string,
        metadata?: Record<string, unknown>
    ): Promise<DescriptionLayer> {
        return this.setLayerInterval(`realm:${realmId}`, layerType, fromTick, toTick, value, metadata)
    }

    async setLayerForLocation(
        locationId: string,
        layerType: LayerType,
        fromTick: number,
        toTick: number | null,
        value: string,
        metadata?: Record<string, unknown>
    ): Promise<DescriptionLayer> {
        return this.setLayerInterval(`loc:${locationId}`, layerType, fromTick, toTick, value, metadata)
    }

    async getActiveLayer(scopeId: string, layerType: LayerType, tick: number): Promise<DescriptionLayer | null> {
        return this.findActiveLayer(scopeId, layerType, tick)
    }

    async setLayerInterval(
        scopeId: string,
        layerType: LayerType,
        fromTick: number,
        toTick: number | null,
        value: string,
        metadata?: Record<string, unknown>
    ): Promise<DescriptionLayer> {
        const layer: DescriptionLayer = {
            id: crypto.randomUUID(),
            scopeId,
            layerType,
            value,
            effectiveFromTick: fromTick,
            effectiveToTick: toTick,
            authoredAt: new Date().toISOString(),
            metadata
        }

        this.layers.set(layer.id, { ...layer })
        return { ...layer }
    }

    async queryLayerHistory(
        scopeId: string,
        layerType: LayerType,
        startTick?: number,
        endTick?: number
    ): Promise<DescriptionLayer[]> {
        let scopeLayers = Array.from(this.layers.values()).filter((layer) => layer.scopeId === scopeId && layer.layerType === layerType)

        // Apply temporal filtering
        if (startTick !== undefined) {
            scopeLayers = scopeLayers.filter((layer) => layer.effectiveFromTick >= startTick)
        }

        if (endTick !== undefined) {
            scopeLayers = scopeLayers.filter((layer) => layer.effectiveToTick === null || layer.effectiveToTick <= endTick)
        }

        // Sort by effectiveFromTick ascending (chronological order)
        scopeLayers.sort((a, b) => a.effectiveFromTick - b.effectiveFromTick)

        return scopeLayers
    }

    /**
     * Helper: Find active layer for a scope at a specific tick
     */
    private findActiveLayer(scopeId: string, layerType: LayerType, tick: number): DescriptionLayer | null {
        const scopeLayers = Array.from(this.layers.values()).filter((layer) => layer.scopeId === scopeId && layer.layerType === layerType)

        // Find layers active at this tick
        const activeLayers = scopeLayers.filter((layer) => {
            return tick >= layer.effectiveFromTick && (layer.effectiveToTick === null || tick <= layer.effectiveToTick)
        })

        // If multiple active layers, return the most recently authored
        if (activeLayers.length > 0) {
            activeLayers.sort((a, b) => b.authoredAt.localeCompare(a.authoredAt))
            return activeLayers[0]
        }

        return null
    }

    // Deprecated methods (backward compatibility)

    async addLayer(layer: DescriptionLayer): Promise<DescriptionLayer> {
        // Support old interface by defaulting to location scope if locationId present
        if (layer.locationId && !layer.scopeId) {
            layer.scopeId = `loc:${layer.locationId}`
        }
        // Support old content field
        if (layer.content && !layer.value) {
            layer.value = layer.content
        }
        // Default temporal fields if not provided
        if (layer.effectiveFromTick === undefined) {
            layer.effectiveFromTick = 0
        }
        if (layer.effectiveToTick === undefined) {
            layer.effectiveToTick = null
        }

        this.layers.set(layer.id, { ...layer })
        return { ...layer }
    }

    async getLayersForLocation(locationId: string): Promise<DescriptionLayer[]> {
        const scopeId = `loc:${locationId}`
        const locationLayers = Array.from(this.layers.values()).filter(
            (layer) => layer.scopeId === scopeId || layer.locationId === locationId
        )

        // Sort by priority (descending), then by layerId (alphanumeric) for deterministic ties
        return locationLayers.sort((a, b) => {
            const aPriority = a.priority ?? 0
            const bPriority = b.priority ?? 0
            if (aPriority !== bPriority) {
                return bPriority - aPriority // Higher priority first
            }
            return a.id.localeCompare(b.id) // Deterministic tie resolution
        })
    }

    async updateLayer(
        layerId: string,
        scopeId: string,
        updates: Partial<Pick<DescriptionLayer, 'value' | 'layerType'>>
    ): Promise<DescriptionLayer | null> {
        const existing = this.layers.get(layerId)

        if (!existing || existing.scopeId !== scopeId) {
            return null
        }

        const updated: DescriptionLayer = {
            ...existing,
            ...updates
        }

        this.layers.set(layerId, updated)
        return { ...updated }
    }

    async deleteLayer(layerId: string, scopeId: string): Promise<boolean> {
        const existing = this.layers.get(layerId)

        if (!existing || existing.scopeId !== scopeId) {
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
