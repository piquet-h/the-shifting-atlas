import { inject, injectable, optional } from 'inversify'
import { TOKENS } from '../di/tokens.js'
import { TelemetryService } from '../telemetry/TelemetryService.js'
import type { ICosmosDbSqlClient } from './base/cosmosDbSqlClient.js'
import type { DescriptionLayer, IDescriptionRepository } from './descriptionRepository.js'
import { MemoryLayerRepository } from './layerRepository.memory.js'
import { fromStoredLayerDocument, toSharedLayerDocument } from './utils/descriptionLayerBridge.js'
import { stripCosmosSystemFields } from './utils/playerDocumentProjection.js'

/**
 * Cosmos SQL API implementation of `IDescriptionRepository` backed by the authoritative
 * `descriptionLayers` container (`PK: /scopeId`), so `EnvironmentChangeHandler` writes
 * are immediately visible to `DescriptionComposer` and `timerComputeIntegrityHashes`
 * hashes real persisted layers.
 */
@injectable()
export class CosmosDescriptionRepository implements IDescriptionRepository {
    private readonly fallbackStore = new MemoryLayerRepository()

    constructor(
        @inject(TelemetryService) protected telemetryService: TelemetryService,
        @inject(TOKENS.CosmosDbSqlClient) @optional() private readonly sqlClient?: ICosmosDbSqlClient,
        @inject(TOKENS.CosmosContainerLayers) @optional() private readonly containerName: string = 'descriptionLayers'
    ) {}

    private get cosmosContainer() {
        return this.sqlClient ? this.sqlClient.getContainer(this.containerName) : null
    }

    private async queryDocs(
        query: string,
        parameters: Array<{ name: string; value: string }> = []
    ): Promise<Array<Record<string, unknown>>> {
        const container = this.cosmosContainer
        if (!container) return []

        const iterator = container.items.query<Record<string, unknown>>({ query, parameters })
        const docs: Array<Record<string, unknown>> = []
        while (iterator.hasMoreResults()) {
            const page = await iterator.fetchNext()
            if (page.resources) {
                docs.push(...page.resources)
            }
        }
        return docs
    }

    async getLayersForLocation(locationId: string): Promise<DescriptionLayer[]> {
        const started = Date.now()
        const scopeId = `loc:${locationId}`

        let rawDocs: Array<Record<string, unknown>>
        if (this.cosmosContainer) {
            const allInContainer = await this.queryDocs('SELECT * FROM c WHERE c.scopeId = @scopeId', [
                { name: '@scopeId', value: scopeId }
            ])
            // Filter in-process as well so lightweight unit-test SQL mocks return scoped rows accurately
            rawDocs = allInContainer.filter((doc) => doc.scopeId === scopeId || doc.locationId === locationId)
        } else {
            rawDocs = this.fallbackStore
                .getAllStoredLayers()
                .filter((doc) => doc.scopeId === scopeId || doc.locationId === locationId) as unknown as Array<Record<string, unknown>>
        }

        const result = rawDocs.map((doc) => fromStoredLayerDocument(doc)).filter((layer) => !layer.archived)

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

            const existing = await this.findRawById(layer.id, `loc:${layer.locationId}`)
            if (existing) {
                this.telemetryService.trackGameEventStrict('Description.Generate.Success', {
                    locationId: layer.locationId,
                    layerId: layer.id,
                    created: false,
                    durationMs: Date.now() - started
                })
                return { created: false, id: layer.id }
            }

            const doc = toSharedLayerDocument(layer)
            if (this.cosmosContainer) {
                await this.cosmosContainer.items.upsert(doc)
            } else {
                await this.fallbackStore.addLayer(doc)
            }

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

    private async findRawById(layerId: string, scopeHint?: string): Promise<Record<string, unknown> | null> {
        const container = this.cosmosContainer
        if (!container) {
            const mem = this.fallbackStore.getStoredLayerById(layerId)
            return mem ? (mem as unknown as Record<string, unknown>) : null
        }

        if (scopeHint) {
            try {
                const { resource } = await container.item(layerId, scopeHint).read<Record<string, unknown>>()
                if (resource) return resource
            } catch {
                // Fall back to query scan if partition key differs or mock keys by id
            }
        }

        const docs = await this.queryDocs('SELECT * FROM c WHERE c.id = @id', [{ name: '@id', value: layerId }])
        return docs.find((d) => d.id === layerId) ?? null
    }

    async archiveLayer(layerId: string): Promise<{ archived: boolean }> {
        if (!this.cosmosContainer) {
            return { archived: this.fallbackStore.patchLayerMetadata(layerId, { archived: true }) }
        }

        const existing = await this.findRawById(layerId)
        if (!existing) return { archived: false }

        const metadata = existing.metadata && typeof existing.metadata === 'object' ? (existing.metadata as Record<string, unknown>) : {}
        await this.cosmosContainer.items.upsert({
            ...stripCosmosSystemFields(existing),
            metadata: { ...metadata, archived: true }
        })
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
        if (!this.cosmosContainer) {
            return this.fallbackStore.getAllStoredLayers().map((d) => fromStoredLayerDocument(d as unknown as Record<string, unknown>))
        }
        const docs = await this.queryDocs('SELECT * FROM c')
        return docs.map((doc) => fromStoredLayerDocument(doc))
    }

    async updateIntegrityHash(layerId: string, integrityHash: string): Promise<{ updated: boolean }> {
        if (!this.cosmosContainer) {
            return { updated: this.fallbackStore.patchLayerMetadata(layerId, { integrityHash }) }
        }

        const existing = await this.findRawById(layerId)
        if (!existing) return { updated: false }

        const metadata = existing.metadata && typeof existing.metadata === 'object' ? (existing.metadata as Record<string, unknown>) : {}
        await this.cosmosContainer.items.upsert({
            ...stripCosmosSystemFields(existing),
            integrityHash,
            metadata: { ...metadata, integrityHash }
        })
        return { updated: true }
    }
}
