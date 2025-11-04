import { injectable } from 'inversify'
import { trackGameEventStrict } from '../telemetry.js'
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
        const started = Date.now()
        const result: DescriptionLayer[] = []

        for (const layer of this.fallback.values()) {
            if (layer.locationId === locationId && !layer.archived) {
                result.push(layer)
            }
        }

        // Emit cache status based on results
        if (result.length > 0) {
            trackGameEventStrict('Description.Cache.Hit', {
                locationId,
                layerCount: result.length,
                durationMs: Date.now() - started
            })
        } else {
            trackGameEventStrict('Description.Cache.Miss', {
                locationId,
                durationMs: Date.now() - started
            })
        }

        return result
    }

    async addLayer(layer: DescriptionLayer): Promise<{ created: boolean; id: string }> {
        const started = Date.now()

        trackGameEventStrict('Description.Generate.Start', {
            locationId: layer.locationId,
            layerId: layer.id,
            layerType: layer.type
        })

        try {
            if (this.fallback.has(layer.id)) {
                trackGameEventStrict('Description.Generate.Success', {
                    locationId: layer.locationId,
                    layerId: layer.id,
                    created: false,
                    durationMs: Date.now() - started
                })
                return { created: false, id: layer.id }
            }

            // Validate that content is not empty
            if (!layer.content || layer.content.trim().length === 0) {
                trackGameEventStrict('Description.Generate.Failure', {
                    locationId: layer.locationId,
                    layerId: layer.id,
                    reason: 'empty-content',
                    durationMs: Date.now() - started
                })
                throw new Error('Description content cannot be empty')
            }

            this.fallback.set(layer.id, { ...layer })

            trackGameEventStrict('Description.Generate.Success', {
                locationId: layer.locationId,
                layerId: layer.id,
                created: true,
                contentLength: layer.content.length,
                durationMs: Date.now() - started
            })

            return { created: true, id: layer.id }
        } catch (error) {
            // Use standardized reason codes for telemetry to avoid exposing sensitive information
            let reason = 'unknown'
            if (error instanceof Error) {
                if (error.message.includes('empty')) {
                    reason = 'empty-content'
                } else {
                    reason = 'validation-error'
                }
            }

            trackGameEventStrict('Description.Generate.Failure', {
                locationId: layer.locationId,
                layerId: layer.id,
                reason,
                durationMs: Date.now() - started
            })
            throw error
        }
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
