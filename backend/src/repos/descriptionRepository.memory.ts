import { inject, injectable } from 'inversify'
import { TelemetryService } from '../telemetry/TelemetryService.js'
import type { DescriptionLayer, IDescriptionRepository } from './descriptionRepository.js'

/**
 * In-memory implementation of IDescriptionRepository.
 * Used for memory mode and integration tests.
 */
@injectable()
export class InMemoryDescriptionRepository implements IDescriptionRepository {
    private layers = new Map<string, DescriptionLayer>()

    // Explicit @inject decorator ensures Inversify constructor metadata recognizes
    // TelemetryService after transition to class-based DI (fixes failing unit test).
    constructor(@inject(TelemetryService) private telemetryService: TelemetryService) {}

    async getLayersForLocation(locationId: string): Promise<DescriptionLayer[]> {
        const started = Date.now()
        const result: DescriptionLayer[] = []

        for (const layer of this.layers.values()) {
            if (layer.locationId === locationId && !layer.archived) {
                result.push(layer)
            }
        }

        // Emit cache status based on results
        if (result.length > 0) {
            this.telemetryService.trackGameEventStrict('Description.Cache.Hit', {
                locationId,
                layerCount: result.length,
                durationMs: Date.now() - started
            })
        } else {
            this.telemetryService.trackGameEventStrict('Description.Cache.Miss', {
                locationId,
                durationMs: Date.now() - started
            })
        }

        return result
    }

    async addLayer(layer: DescriptionLayer): Promise<{ created: boolean; id: string }> {
        const started = Date.now()

        this.telemetryService.trackGameEventStrict('Description.Generate.Start', {
            locationId: layer.locationId,
            layerId: layer.id,
            layerType: layer.type
        })

        try {
            if (this.layers.has(layer.id)) {
                this.telemetryService.trackGameEventStrict('Description.Generate.Success', {
                    locationId: layer.locationId,
                    layerId: layer.id,
                    created: false,
                    durationMs: Date.now() - started
                })
                return { created: false, id: layer.id }
            }

            // Validate that content is not empty
            if (!layer.content || layer.content.trim().length === 0) {
                this.telemetryService.trackGameEventStrict('Description.Generate.Failure', {
                    locationId: layer.locationId,
                    layerId: layer.id,
                    reason: 'empty-content',
                    durationMs: Date.now() - started
                })
                throw new Error('Description content cannot be empty')
            }

            this.layers.set(layer.id, { ...layer })

            this.telemetryService.trackGameEventStrict('Description.Generate.Success', {
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

            this.telemetryService.trackGameEventStrict('Description.Generate.Failure', {
                locationId: layer.locationId,
                layerId: layer.id,
                reason,
                durationMs: Date.now() - started
            })
            throw error
        }
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

    async getAllLayers(): Promise<DescriptionLayer[]> {
        return Array.from(this.layers.values())
    }

    async updateIntegrityHash(layerId: string, integrityHash: string): Promise<{ updated: boolean }> {
        const layer = this.layers.get(layerId)
        if (!layer) return { updated: false }
        layer.integrityHash = integrityHash
        return { updated: true }
    }
}
