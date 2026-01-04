/**
 * Cosmos SQL API implementation of ILayerRepository.
 * Uses partition key /scopeId for realm-aware layer queries.
 *
 * Container: descriptionLayers
 * Partition Key: /scopeId
 * Scope patterns: 'loc:<locationId>' or 'realm:<realmId>'
 * Goal: Layer retrieval latency ≤50ms p95; ≥99% single-partition queries
 */

import type { DescriptionLayer, LayerType } from '@piquet-h/shared/types/layerRepository'
import { inject, injectable, optional } from 'inversify'
import { TelemetryService } from '../telemetry/TelemetryService.js'
import { CosmosDbSqlRepository } from './base/CosmosDbSqlRepository.js'
import type { ICosmosDbSqlClient } from './base/cosmosDbSqlClient.js'
import type { ILayerRepository } from './layerRepository.js'
import type { IRealmRepository } from './realmRepository.js'

/**
 * SQL API document schema for description layers
 */
interface LayerDocument {
    id: string
    scopeId: string
    layerType: LayerType
    value: string
    effectiveFromTick: number
    effectiveToTick: number | null
    authoredAt: string
    metadata?: Record<string, unknown>
    // Deprecated fields for backward compatibility
    locationId?: string
    content?: string
    priority?: number
}

@injectable()
export class CosmosLayerRepository extends CosmosDbSqlRepository<LayerDocument> implements ILayerRepository {
    private readonly _telemetry: TelemetryService
    private readonly _realmRepository?: IRealmRepository

    constructor(
        @inject('CosmosDbSqlClient') sqlClient: ICosmosDbSqlClient,
        @inject(TelemetryService) telemetryService: TelemetryService,
        @inject('IRealmRepository') @optional() realmRepository?: IRealmRepository
    ) {
        super(sqlClient, 'descriptionLayers', telemetryService)
        this._telemetry = telemetryService
        this._realmRepository = realmRepository
    }

    async getActiveLayerForLocation(locationId: string, layerType: LayerType, tick: number): Promise<DescriptionLayer | null> {
        const startTime = Date.now()

        // Priority 1: Location-specific layer
        const locationScopeId = `loc:${locationId}`
        const locationLayer = await this.findActiveLayer(locationScopeId, layerType, tick)
        if (locationLayer) {
            this._telemetry.trackGameEvent('Layer.GetActive', {
                locationId,
                layerType,
                tick,
                scopeType: 'location',
                latencyMs: Date.now() - startTime
            })
            return locationLayer
        }

        // Priority 2+: Realm hierarchy (weather zone, then broader realms)
        if (this._realmRepository) {
            try {
                const containingRealms = await this._realmRepository.getContainmentChain(locationId)

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
                    const realmLayer = await this.findActiveLayer(realmScopeId, layerType, tick)
                    if (realmLayer) {
                        this._telemetry.trackGameEvent('Layer.GetActive', {
                            locationId,
                            layerType,
                            tick,
                            scopeType: 'realm',
                            realmId: realm.id,
                            realmScope: realm.scope,
                            latencyMs: Date.now() - startTime
                        })
                        return realmLayer
                    }
                }
            } catch (error) {
                console.warn(`[CosmosLayerRepository] Realm lookup failed for location ${locationId}:`, error)
            }
        }

        this._telemetry.trackGameEvent('Layer.GetActive', {
            locationId,
            layerType,
            tick,
            scopeType: 'none',
            latencyMs: Date.now() - startTime
        })

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
        const startTime = Date.now()

        const layer = await this.findActiveLayer(scopeId, layerType, tick)

        this._telemetry.trackGameEvent('Layer.GetActive.Direct', {
            scopeId,
            layerType,
            tick,
            found: !!layer,
            latencyMs: Date.now() - startTime
        })

        return layer
    }

    async setLayerInterval(
        scopeId: string,
        layerType: LayerType,
        fromTick: number,
        toTick: number | null,
        value: string,
        metadata?: Record<string, unknown>
    ): Promise<DescriptionLayer> {
        const startTime = Date.now()

        const layer: LayerDocument = {
            id: crypto.randomUUID(),
            scopeId,
            layerType,
            value,
            effectiveFromTick: fromTick,
            effectiveToTick: toTick,
            authoredAt: new Date().toISOString(),
            metadata
        }

        const { resource } = await this.upsert(layer)

        this._telemetry.trackGameEvent('Layer.SetInterval', {
            layerId: layer.id,
            scopeId,
            layerType,
            fromTick,
            toTick: toTick ?? 'indefinite',
            latencyMs: Date.now() - startTime
        })

        return resource
    }

    async queryLayerHistory(scopeId: string, layerType: LayerType, startTick?: number, endTick?: number): Promise<DescriptionLayer[]> {
        const startTime = Date.now()

        let queryText = `
            SELECT * FROM c 
            WHERE c.scopeId = @scopeId 
            AND c.layerType = @layerType
        `
        const parameters: Array<{ name: string; value: string | number }> = [
            { name: '@scopeId', value: scopeId },
            { name: '@layerType', value: layerType }
        ]

        if (startTick !== undefined) {
            queryText += ' AND c.effectiveFromTick >= @startTick'
            parameters.push({ name: '@startTick', value: startTick })
        }

        if (endTick !== undefined) {
            queryText += ' AND (c.effectiveToTick IS NULL OR c.effectiveToTick <= @endTick)'
            parameters.push({ name: '@endTick', value: endTick })
        }

        queryText += ' ORDER BY c.effectiveFromTick ASC'

        const { items } = await this.query(queryText, parameters)

        this._telemetry.trackGameEvent('Layer.QueryHistory', {
            scopeId,
            layerType,
            startTick: startTick ?? 'unbounded',
            endTick: endTick ?? 'unbounded',
            resultCount: items.length,
            latencyMs: Date.now() - startTime
        })

        return items
    }

    /**
     * Helper: Find active layer for a scope at a specific tick
     */
    private async findActiveLayer(scopeId: string, layerType: LayerType, tick: number): Promise<DescriptionLayer | null> {
        const queryText = `
            SELECT * FROM c 
            WHERE c.scopeId = @scopeId 
            AND c.layerType = @layerType
            AND c.effectiveFromTick <= @tick
            AND (c.effectiveToTick IS NULL OR c.effectiveToTick >= @tick)
            ORDER BY c.authoredAt DESC
        `
        const parameters = [
            { name: '@scopeId', value: scopeId },
            { name: '@layerType', value: layerType },
            { name: '@tick', value: tick }
        ]

        const { items } = await this.query(queryText, parameters)

        // Return most recently authored active layer
        return items.length > 0 ? items[0] : null
    }

    // Deprecated methods (backward compatibility)

    async addLayer(layer: DescriptionLayer): Promise<DescriptionLayer> {
        const startTime = Date.now()

        // Support old interface by defaulting to location scope if locationId present
        const scopeId = layer.scopeId || (layer.locationId ? `loc:${layer.locationId}` : undefined)
        if (!scopeId) {
            throw new Error('Layer must have either scopeId or locationId')
        }

        // Support old content field
        const value = layer.value || layer.content
        if (!value) {
            throw new Error('Layer must have either value or content')
        }

        // Validate content size (edge case: content exceeds 100KB)
        const contentSize = Buffer.byteLength(value, 'utf8')
        const MAX_CONTENT_SIZE = 100_000 // 100KB limit

        if (contentSize > MAX_CONTENT_SIZE) {
            console.warn(
                `Layer content for ${layer.id} exceeds ${MAX_CONTENT_SIZE} bytes (${contentSize} bytes), allowing but logging warning`
            )
        }

        const doc: LayerDocument = {
            id: layer.id,
            scopeId,
            layerType: layer.layerType,
            value,
            effectiveFromTick: layer.effectiveFromTick ?? 0,
            effectiveToTick: layer.effectiveToTick ?? null,
            authoredAt: layer.authoredAt,
            metadata: layer.metadata,
            // Preserve deprecated fields for backward compatibility
            locationId: layer.locationId,
            content: layer.content,
            priority: layer.priority
        }

        // Use upsert to handle create or update
        const { resource } = await this.upsert(doc)

        this._telemetry.trackGameEvent('Layer.Add', {
            layerId: layer.id,
            scopeId,
            layerType: layer.layerType,
            contentSize,
            latencyMs: Date.now() - startTime
        })

        return resource
    }

    async getLayersForLocation(locationId: string): Promise<DescriptionLayer[]> {
        const startTime = Date.now()

        const scopeId = `loc:${locationId}`

        // Query both old and new partition keys for backward compatibility
        const queryText = 'SELECT * FROM c WHERE c.scopeId = @scopeId OR c.locationId = @locationId'
        const parameters = [
            { name: '@scopeId', value: scopeId },
            { name: '@locationId', value: locationId }
        ]

        const { items } = await this.query(queryText, parameters)

        // Sort in-memory: priority DESC (higher first), then by id ASC (deterministic ties)
        items.sort((a, b) => {
            const aPriority = a.priority ?? 0
            const bPriority = b.priority ?? 0
            if (aPriority !== bPriority) {
                return bPriority - aPriority // Higher priority first
            }
            return a.id.localeCompare(b.id) // Deterministic tie-break
        })

        this._telemetry.trackGameEvent('Layer.GetForLocation', {
            locationId,
            layerCount: items.length,
            latencyMs: Date.now() - startTime
        })

        // Edge case: location has 0 layers -> empty result (base layer is world seed concern)
        return items
    }

    async updateLayer(
        layerId: string,
        scopeId: string,
        updates: Partial<Pick<DescriptionLayer, 'value' | 'layerType'>>
    ): Promise<DescriptionLayer | null> {
        const startTime = Date.now()

        // Get existing layer
        const existing = await this.getById(layerId, scopeId)
        if (!existing) {
            this._telemetry.trackGameEvent('Layer.Update', {
                layerId,
                scopeId,
                updated: false,
                reason: 'not-found',
                latencyMs: Date.now() - startTime
            })
            return null
        }

        // Validate value size if being updated
        if (updates.value !== undefined) {
            const contentSize = Buffer.byteLength(updates.value, 'utf8')
            const MAX_CONTENT_SIZE = 100_000 // 100KB limit

            if (contentSize > MAX_CONTENT_SIZE) {
                console.warn(
                    `Updated layer value for ${layerId} exceeds ${MAX_CONTENT_SIZE} bytes (${contentSize} bytes), allowing but logging warning`
                )
            }
        }

        // Apply updates
        const updated: LayerDocument = {
            ...existing,
            ...updates
        }

        const { resource } = await this.upsert(updated)

        this._telemetry.trackGameEvent('Layer.Update', {
            layerId,
            scopeId,
            updated: true,
            updatedFields: Object.keys(updates),
            latencyMs: Date.now() - startTime
        })

        return resource
    }

    async deleteLayer(layerId: string, scopeId: string): Promise<boolean> {
        const startTime = Date.now()

        const deleted = await this.delete(layerId, scopeId)

        this._telemetry.trackGameEvent('Layer.Delete', {
            layerId,
            scopeId,
            deleted,
            latencyMs: Date.now() - startTime
        })

        return deleted
    }
}
