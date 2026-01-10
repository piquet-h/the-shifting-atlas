import { inject, injectable } from 'inversify'
import { TelemetryService } from '../telemetry/TelemetryService.js'
import type { CanonicalFact } from '../types/lore.js'
import { CosmosDbSqlRepository } from './base/CosmosDbSqlRepository.js'
import type { ICosmosDbSqlClient } from './base/cosmosDbSqlClient.js'
import { ILoreRepository } from './loreRepository.js'

/**
 * Cosmos SQL API implementation of ILoreRepository.
 *
 * Extends CosmosDbSqlRepository to inherit automatic telemetry emission:
 * - SQL.Query.Executed with partitionKey, ruCharge, containerName dimensions
 * - Enables automatic partition monitoring via base class telemetry
 *
 * Container: `loreFacts` (PK: `/type`)
 * Partition strategy: Facts grouped by type for efficient category queries
 */
@injectable()
export class CosmosLoreRepository extends CosmosDbSqlRepository<CanonicalFact> implements ILoreRepository {
    constructor(
        @inject('CosmosDbSqlClient') sqlClient: ICosmosDbSqlClient,
        @inject('CosmosContainer:LoreFacts') containerName: string,
        @inject(TelemetryService) protected telemetryService: TelemetryService
    ) {
        super(sqlClient, containerName, telemetryService)
    }

    /**
     * Retrieve a single canonical fact by business identifier.
     *
     * Implementation note: Performs cross-partition query (factId is indexed but not PK).
     * Expected RU cost: ~3-5 RU per query (single fact lookup across partitions).
     * Future optimization: Secondary index on factId if query volume warrants.
     *
     * @param factId - Unique business key (e.g., 'faction_shadow_council')
     * @returns Fact if found, undefined otherwise
     */
    async getFact(factId: string): Promise<CanonicalFact | undefined> {
        const querySpec = {
            query: 'SELECT * FROM c WHERE c.factId = @factId',
            parameters: [{ name: '@factId', value: factId }]
        }

        try {
            const results = await this.query(querySpec.query, querySpec.parameters, 1)
            return results.items.length > 0 ? results.items[0] : undefined
        } catch (error) {
            // Base class telemetry already emitted SQL.Query.Failed
            throw error
        }
    }

    /**
     * Search for canonical facts matching a query.
     *
     * Stub implementation: Returns empty array until embeddings infrastructure exists.
     * Future: Vector similarity search using embeddings field with Azure AI Search or in-container vector index.
     *
     * @param query - Natural language search query
     * @param k - Maximum number of results (default: 5)
     * @returns Array of matching facts (empty until semantic search implemented)
     */
    async searchFacts(query: string, k: number = 5): Promise<CanonicalFact[]> {
        // Stub: Return empty array until embeddings infrastructure exists
        // Future implementation will use vector similarity search
        void query
        void k
        return []
    }
}
