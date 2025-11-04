import { injectable } from 'inversify'
import { trackGameEventStrict } from '../../../src/telemetry.js'
import type { DescriptionLayer, IDescriptionRepository } from '../../../src/repos/descriptionRepository.js'

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
        const started = Date.now()
        const result: DescriptionLayer[] = []

        for (const layer of this.mockLayers.values()) {
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
            if (this.mockLayers.has(layer.id)) {
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

            this.mockLayers.set(layer.id, { ...layer })

            trackGameEventStrict('Description.Generate.Success', {
                locationId: layer.locationId,
                layerId: layer.id,
                created: true,
                contentLength: layer.content.length,
                durationMs: Date.now() - started
            })

            return { created: true, id: layer.id }
        } catch (error) {
            trackGameEventStrict('Description.Generate.Failure', {
                locationId: layer.locationId,
                layerId: layer.id,
                reason: error instanceof Error ? error.message : 'unknown',
                durationMs: Date.now() - started
            })
            throw error
        }
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
