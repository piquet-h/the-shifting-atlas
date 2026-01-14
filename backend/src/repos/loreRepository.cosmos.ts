import type { CanonicalFact } from '@piquet-h/shared'
import { inject, injectable } from 'inversify'
import { v4 as uuidv4 } from 'uuid'
import { TelemetryService } from '../telemetry/TelemetryService.js'
import { CosmosDbSqlRepository } from './base/CosmosDbSqlRepository.js'
import type { ICosmosDbSqlClient } from './base/cosmosDbSqlClient.js'
import { ConflictError, ILoreRepository } from './loreRepository.js'

/**
 * Cosmos SQL API implementation of ILoreRepository.
 *
 * Extends CosmosDbSqlRepository to inherit automatic telemetry emission:
 * - SQL.Query.Executed with partitionKey, ruCharge, containerName dimensions
 * - Enables automatic partition monitoring via base class telemetry
 *
 * Container: `loreFacts` (PK: `/type`)
 * Partition strategy: Facts grouped by type for efficient category queries
 *
 * Versioning Implementation (ADR-007):
 * - Each version is a separate document with unique `id` (GUID)
 * - `factId` is stable business key across versions
 * - getFact returns latest non-archived version
 * - Optimistic concurrency via version number comparison
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
     * Retrieve latest non-archived version of a fact by business identifier.
     *
     * Implementation note: Performs cross-partition query (factId is indexed but not PK).
     * Expected RU cost: ~3-5 RU per query (single fact lookup across partitions).
     * Uses composite index (factId ASC, version DESC) for efficiency.
     *
     * @param factId - Unique business key (e.g., 'faction_shadow_council')
     * @returns Latest non-archived fact version if found, undefined otherwise
     */
    async getFact(factId: string): Promise<CanonicalFact | undefined> {
        const querySpec = {
            query: `SELECT TOP 1 * FROM c 
                    WHERE c.factId = @factId 
                      AND (NOT IS_DEFINED(c.archivedUtc) OR c.archivedUtc = null)
                    ORDER BY c.version DESC`,
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
     * Retrieve a specific version of a fact (includes archived versions).
     *
     * @param factId - Unique business key
     * @param version - Version number
     * @returns Specific fact version if found, undefined otherwise
     */
    async getFactVersion(factId: string, version: number): Promise<CanonicalFact | undefined> {
        const querySpec = {
            query: 'SELECT * FROM c WHERE c.factId = @factId AND c.version = @version',
            parameters: [
                { name: '@factId', value: factId },
                { name: '@version', value: version }
            ]
        }

        try {
            const results = await this.query(querySpec.query, querySpec.parameters, 1)
            return results.items.length > 0 ? results.items[0] : undefined
        } catch (error) {
            throw error
        }
    }

    /**
     * Retrieve all versions of a fact (including archived).
     *
     * @param factId - Unique business key
     * @returns Array of all versions ordered by version DESC (newest first)
     */
    async listFactVersions(factId: string): Promise<CanonicalFact[]> {
        const querySpec = {
            query: 'SELECT * FROM c WHERE c.factId = @factId ORDER BY c.version DESC',
            parameters: [{ name: '@factId', value: factId }]
        }

        try {
            const results = await this.query(querySpec.query, querySpec.parameters)
            return results.items
        } catch (error) {
            throw error
        }
    }

    /**
     * Create a new version of an existing fact.
     *
     * Performs optimistic concurrency check: throws ConflictError if
     * expectedCurrentVersion doesn't match actual current version.
     *
     * Implementation:
     * 1. Fetch current version and validate
     * 2. Create new document with incremented version
     * 3. Optionally update previous version's updatedUtc (separate operation)
     *
     * @param factId - Unique business key
     * @param fields - Updated fact fields (immutable per version)
     * @param expectedCurrentVersion - Expected current version (for conflict detection)
     * @returns Newly created fact version
     * @throws ConflictError if version mismatch (concurrent edit detected)
     */
    async createFactVersion(factId: string, fields: Record<string, unknown>, expectedCurrentVersion: number): Promise<CanonicalFact> {
        const current = await this.getFact(factId)
        if (!current) {
            throw new Error(`Fact ${factId} not found`)
        }
        if (current.version !== expectedCurrentVersion) {
            throw new ConflictError(`Version conflict: expected ${expectedCurrentVersion}, got ${current.version}`)
        }

        const newVersion: CanonicalFact = {
            id: uuidv4(),
            type: current.type,
            factId,
            fields,
            version: current.version + 1,
            createdUtc: new Date().toISOString(),
            updatedUtc: new Date().toISOString()
        }

        // Insert new version document
        await this.upsert(newVersion)

        // Optionally update previous version's updatedUtc to mark supersession
        // Note: This is a separate write operation (not atomic with new version creation)
        try {
            const previousWithTimestamp = { ...current, updatedUtc: newVersion.createdUtc }
            await this.upsert(previousWithTimestamp)
        } catch (error) {
            // Non-critical: new version already created
            // Log error but don't fail the operation
            console.warn(`Failed to update previous version timestamp for ${factId}:${current.version}`, error)
        }

        return newVersion
    }

    /**
     * Archive a specific version or all versions of a fact.
     *
     * Sets `archivedUtc` timestamp. Archived versions excluded from default getFact queries
     * but remain accessible via getFactVersion and listFactVersions.
     *
     * Note: Each archived version requires a separate update operation.
     * RU cost scales with number of versions archived.
     *
     * @param factId - Unique business key
     * @param version - Optional specific version to archive. If omitted, archives all versions.
     * @returns Number of versions archived
     */
    async archiveFact(factId: string, version?: number): Promise<number> {
        const timestamp = new Date().toISOString()
        let archived = 0

        if (version !== undefined) {
            // Archive specific version
            const fact = await this.getFactVersion(factId, version)
            if (fact && !fact.archivedUtc) {
                const archivedFact = { ...fact, archivedUtc: timestamp }
                await this.upsert(archivedFact)
                archived = 1
            }
        } else {
            // Archive all versions
            const versions = await this.listFactVersions(factId)
            for (const fact of versions) {
                if (!fact.archivedUtc) {
                    const archivedFact = { ...fact, archivedUtc: timestamp }
                    await this.upsert(archivedFact)
                    archived++
                }
            }
        }

        return archived
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
