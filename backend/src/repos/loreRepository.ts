import type { CanonicalFact } from '@piquet-h/shared'

/**
 * Repository contract for canonical lore facts.
 *
 * Persistence: Cosmos SQL API `loreFacts` container (PK: /type)
 * Implementations: Memory (in-memory/testing), Cosmos (production)
 *
 * Versioning Strategy (ADR-007):
 * - Each version is a separate immutable document with unique Cosmos `id`
 * - `factId` is stable business key across versions
 * - `version` increments monotonically on edits
 * - `archivedUtc` marks soft-deleted versions (excluded from default queries)
 */
export interface ILoreRepository {
    /**
     * Retrieve latest non-archived version of a fact by business identifier.
     *
     * @param factId - Unique business key (e.g., 'faction_shadow_council')
     * @returns Latest non-archived fact version if found, undefined otherwise
     */
    getFact(factId: string): Promise<CanonicalFact | undefined>

    /**
     * Retrieve a specific version of a fact (includes archived versions).
     *
     * @param factId - Unique business key
     * @param version - Version number
     * @returns Specific fact version if found, undefined otherwise
     */
    getFactVersion(factId: string, version: number): Promise<CanonicalFact | undefined>

    /**
     * Retrieve all versions of a fact (including archived).
     *
     * @param factId - Unique business key
     * @returns Array of all versions ordered by version DESC (newest first)
     */
    listFactVersions(factId: string): Promise<CanonicalFact[]>

    /**
     * Create a new version of an existing fact.
     *
     * Performs optimistic concurrency check: throws ConflictError if
     * expectedCurrentVersion doesn't match actual current version.
     *
     * @param factId - Unique business key
     * @param fields - Updated fact fields (immutable per version)
     * @param expectedCurrentVersion - Expected current version (for conflict detection)
     * @returns Newly created fact version
     * @throws ConflictError if version mismatch (concurrent edit detected)
     */
    createFactVersion(factId: string, fields: Record<string, unknown>, expectedCurrentVersion: number): Promise<CanonicalFact>

    /**
     * Archive a specific version or all versions of a fact.
     *
     * Sets `archivedUtc` timestamp. Archived versions excluded from default getFact queries
     * but remain accessible via getFactVersion and listFactVersions.
     *
     * @param factId - Unique business key
     * @param version - Optional specific version to archive. If omitted, archives all versions.
     * @returns Number of versions archived
     */
    archiveFact(factId: string, version?: number): Promise<number>

    /**
     * Search for canonical facts matching a query.
     *
     * Initial implementation: Returns empty array (semantic search not yet implemented).
     * Future: Vector similarity search using embeddings field.
     *
     * @param query - Natural language search query
     * @param k - Maximum number of results (default: 5)
     * @returns Array of matching facts (empty until embeddings infrastructure exists)
     */
    searchFacts(query: string, k?: number): Promise<CanonicalFact[]>
}

/**
 * Error thrown when optimistic concurrency check fails during fact version creation.
 */
export class ConflictError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ConflictError'
    }
}
