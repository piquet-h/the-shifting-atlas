/**
 * Local type definition for CanonicalFact during development.
 *
 * This mirrors the definition in @piquet-h/shared/src/domainModels.ts
 * Once the shared package is published with CanonicalFact,
 * this file will be removed and imports will switch to '@piquet-h/shared'.
 *
 * See Issue #729: Design versioning strategy for canonical lore facts
 */

export type FactType = 'faction' | 'artifact' | 'historical_event' | 'character' | 'location_lore' | 'creature'

export interface CanonicalFact {
    /** Cosmos SQL document ID (GUID). Unique per version; changes on fact mutation. */
    id: string

    /** Fact type (partition key value: 'faction', 'artifact', 'location_lore', etc.). */
    type: FactType

    /** Unique business identifier for stable references across versions (e.g., 'faction_shadow_council'). */
    factId: string

    /** Structured fact data (flexible schema per type). Immutable per version. */
    fields: Record<string, unknown>

    /** Version number for change tracking. Incremented on mutations. */
    version: number

    /** Optional: Vector embeddings for semantic search (embeddings generated on version creation). */
    embeddings?: number[]

    /** Creation timestamp (ISO 8601 UTC). */
    createdUtc: string

    /** Last update timestamp (ISO 8601 UTC). Set when a new version is created from this one. */
    updatedUtc?: string

    /** Optional: Archival timestamp (ISO 8601 UTC). When set, version is excluded from default queries. */
    archivedUtc?: string
}
