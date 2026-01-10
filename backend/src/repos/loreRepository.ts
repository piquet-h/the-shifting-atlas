import type { CanonicalFact } from '../types/lore.js'

/**
 * Repository contract for canonical lore facts.
 *
 * Persistence: Cosmos SQL API `loreFacts` container (PK: /type)
 * Implementations: Memory (in-memory/testing), Cosmos (production)
 *
 * Version increment logic: Deferred until authoring workflow designed.
 * Version field exists but increment responsibility not yet defined.
 */
export interface ILoreRepository {
    /**
     * Retrieve a single canonical fact by business identifier.
     *
     * @param factId - Unique business key (e.g., 'faction_shadow_council')
     * @returns Fact if found, undefined otherwise
     */
    getFact(factId: string): Promise<CanonicalFact | undefined>

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
