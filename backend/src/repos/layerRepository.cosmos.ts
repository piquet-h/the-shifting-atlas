/**
 * Cosmos SQL API implementation of ILayerRepository.
 * Uses partition key /locationId for efficient single-location layer queries.
 *
 * Container: descriptionLayers
 * Partition Key: /locationId
 * Goal: Layer retrieval latency ≤50ms p95; ≥99% single-partition queries
 */

import type { DescriptionLayer } from '@piquet-h/shared/types/layerRepository'
import { inject, injectable } from 'inversify'
import type { TelemetryService } from '../telemetry/TelemetryService.js'
import { CosmosDbSqlRepository } from './base/CosmosDbSqlRepository.js'
import type { ICosmosDbSqlClient } from './base/cosmosDbSqlClient.js'
import type { ILayerRepository } from './layerRepository.js'

/**
 * SQL API document schema for description layers
 */
interface LayerDocument extends DescriptionLayer {
    id: string
    locationId: string
    layerType: 'base' | 'ambient' | 'dynamic'
    content: string
    priority: number
    authoredAt: string
}

@injectable()
export class CosmosLayerRepository extends CosmosDbSqlRepository<LayerDocument> implements ILayerRepository {
    constructor(
        @inject('CosmosDbSqlClient') sqlClient: ICosmosDbSqlClient,
        @inject('TelemetryService') protected telemetryService: TelemetryService
    ) {
        super(sqlClient, 'descriptionLayers')
    }

    async addLayer(layer: DescriptionLayer): Promise<DescriptionLayer> {
        const startTime = Date.now()

        // Validate content size (edge case: content exceeds 100KB)
        const contentSize = Buffer.byteLength(layer.content, 'utf8')
        const MAX_CONTENT_SIZE = 100_000 // 100KB limit

        if (contentSize > MAX_CONTENT_SIZE) {
            console.warn(
                `Layer content for ${layer.id} exceeds ${MAX_CONTENT_SIZE} bytes (${contentSize} bytes), allowing but logging warning`
            )
        }

        const doc: LayerDocument = {
            id: layer.id,
            locationId: layer.locationId,
            layerType: layer.layerType,
            content: layer.content,
            priority: layer.priority,
            authoredAt: layer.authoredAt
        }

        // Use upsert to handle create or update
        const { resource } = await this.upsert(doc)

        this.telemetryService.trackGameEvent('Layer.Add', {
            layerId: layer.id,
            locationId: layer.locationId,
            layerType: layer.layerType,
            priority: layer.priority,
            contentSize,
            latencyMs: Date.now() - startTime
        })

        return resource
    }

    async getLayersForLocation(locationId: string): Promise<DescriptionLayer[]> {
        const startTime = Date.now()

        // Single-partition query (efficient)
        // Sort by priority DESC (higher first), then by id ASC (deterministic ties)
        const queryText = 'SELECT * FROM c WHERE c.locationId = @locationId ORDER BY c.priority DESC, c.id ASC'
        const parameters = [{ name: '@locationId', value: locationId }]

        const { items } = await this.query(queryText, parameters)

        this.telemetryService.trackGameEvent('Layer.GetForLocation', {
            locationId,
            layerCount: items.length,
            latencyMs: Date.now() - startTime
        })

        // Edge case: location has 0 layers -> empty result (base layer is world seed concern)
        return items
    }

    async updateLayer(
        layerId: string,
        locationId: string,
        updates: Partial<Pick<DescriptionLayer, 'content' | 'priority' | 'layerType'>>
    ): Promise<DescriptionLayer | null> {
        const startTime = Date.now()

        // Get existing layer
        const existing = await this.getById(layerId, locationId)
        if (!existing) {
            this.telemetryService.trackGameEvent('Layer.Update', {
                layerId,
                locationId,
                updated: false,
                reason: 'not-found',
                latencyMs: Date.now() - startTime
            })
            return null
        }

        // Validate content size if content is being updated
        if (updates.content !== undefined) {
            const contentSize = Buffer.byteLength(updates.content, 'utf8')
            const MAX_CONTENT_SIZE = 100_000 // 100KB limit

            if (contentSize > MAX_CONTENT_SIZE) {
                console.warn(
                    `Updated layer content for ${layerId} exceeds ${MAX_CONTENT_SIZE} bytes (${contentSize} bytes), allowing but logging warning`
                )
            }
        }

        // Apply updates
        const updated: LayerDocument = {
            ...existing,
            ...updates
        }

        const { resource } = await this.upsert(updated)

        this.telemetryService.trackGameEvent('Layer.Update', {
            layerId,
            locationId,
            updated: true,
            updatedFields: Object.keys(updates),
            latencyMs: Date.now() - startTime
        })

        return resource
    }

    async deleteLayer(layerId: string, locationId: string): Promise<boolean> {
        const startTime = Date.now()

        const deleted = await this.delete(layerId, locationId)

        this.telemetryService.trackGameEvent('Layer.Delete', {
            layerId,
            locationId,
            deleted,
            latencyMs: Date.now() - startTime
        })

        return deleted
    }
}
