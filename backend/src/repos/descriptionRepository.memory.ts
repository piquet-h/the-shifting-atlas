import { inject, injectable, optional } from 'inversify'
import { TOKENS } from '../di/tokens.js'
import { TelemetryService } from '../telemetry/TelemetryService.js'
import type { DescriptionLayer, IDescriptionRepository } from './descriptionRepository.js'
import type { ILayerRepository } from './layerRepository.js'
import { MemoryLayerRepository } from './layerRepository.memory.js'
import { fromStoredLayerDocument, toSharedLayerDocument } from './utils/descriptionLayerBridge.js'

/**
 * In-memory implementation of IDescriptionRepository.
 * Shares the container's `MemoryLayerRepository` instance when available so
 * `EnvironmentChangeHandler`, `DescriptionComposer`, and `computeDescriptionIntegrityHashes`
 * operate on one unified in-memory layer store during local dev and integration tests.
 */
@injectable()
export class InMemoryDescriptionRepository implements IDescriptionRepository {
    private readonly backingStore: MemoryLayerRepository

    constructor(
        @inject(TelemetryService) private telemetryService: TelemetryService,
        @inject(TOKENS.LayerRepository) @optional() layerRepo?: ILayerRepository
    ) {
        this.backingStore = layerRepo instanceof MemoryLayerRepository ? layerRepo : new MemoryLayerRepository()
    }

    async getLayersForLocation(locationId: string): Promise<DescriptionLayer[]> {
        const started = Date.now()
        const scopeId = `loc:${locationId}`
        const result = this.backingStore
            .getAllStoredLayers()
            .filter((doc) => doc.scopeId === scopeId || doc.locationId === locationId)
            .map((doc) => fromStoredLayerDocument(doc as unknown as Record<string, unknown>))
            .filter((layer) => !layer.archived)

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
            if (!layer.content || layer.content.trim().length === 0) {
                this.telemetryService.trackGameEventStrict('Description.Generate.Failure', {
                    locationId: layer.locationId,
                    layerId: layer.id,
                    reason: 'empty-content',
                    durationMs: Date.now() - started
                })
                throw new Error('Description content cannot be empty')
            }

            if (this.backingStore.getStoredLayerById(layer.id)) {
                this.telemetryService.trackGameEventStrict('Description.Generate.Success', {
                    locationId: layer.locationId,
                    layerId: layer.id,
                    created: false,
                    durationMs: Date.now() - started
                })
                return { created: false, id: layer.id }
            }

            await this.backingStore.addLayer(toSharedLayerDocument(layer))

            this.telemetryService.trackGameEventStrict('Description.Generate.Success', {
                locationId: layer.locationId,
                layerId: layer.id,
                created: true,
                contentLength: layer.content.length,
                durationMs: Date.now() - started
            })

            return { created: true, id: layer.id }
        } catch (error) {
            if (!(error instanceof Error && error.message.includes('empty'))) {
                this.telemetryService.trackGameEventStrict('Description.Generate.Failure', {
                    locationId: layer.locationId,
                    layerId: layer.id,
                    reason: 'validation-error',
                    durationMs: Date.now() - started
                })
            }
            throw error
        }
    }

    async archiveLayer(layerId: string): Promise<{ archived: boolean }> {
        return { archived: this.backingStore.patchLayerMetadata(layerId, { archived: true }) }
    }

    async getLayersForLocations(locationIds: string[]): Promise<Map<string, DescriptionLayer[]>> {
        const result = new Map<string, DescriptionLayer[]>()
        for (const locId of locationIds) {
            result.set(locId, await this.getLayersForLocation(locId))
        }
        return result
    }

    async getAllLayers(): Promise<DescriptionLayer[]> {
        return this.backingStore.getAllStoredLayers().map((doc) => fromStoredLayerDocument(doc as unknown as Record<string, unknown>))
    }

    async updateIntegrityHash(layerId: string, integrityHash: string): Promise<{ updated: boolean }> {
        return { updated: this.backingStore.patchLayerMetadata(layerId, { integrityHash }) }
    }
}
