/**
 * Core domain model types for the Shifting Atlas world graph.
 *
 * Gremlin edge semantics (conceptual):
 * (location)-[:exit { direction }]->(location)          // Directional exits between locations
 * (player)-[:in]->(location)                           // Player currently located in a location (mirrored by currentLocationId prop)
 * (item)-[:located_in]->(location)                     // Dropped / placed item location
 * (item)-[:held_by]->(player)                          // Item in player inventory (alternative to list-based inventory)
 * (event)-[:targets]->(location|player|item|npc)       // WorldEvent target relationships (future use)
 *
 * IDs: All IDs are GUID/UUID style strings (runtime generation not enforced here).
 * Time fields are ISO 8601 strings (UTC) to stay serialization friendly across Functions & frontend.
 *
 * ## Dual WorldEvent Models (Intentional Separation)
 *
 * The rationale and contract-level details for the two-model split live in documentation:
 * `docs/architecture/world-event-contract.md#two-related-models-worldevent-vs-worldeventenvelope-intentional`
 */

// --- Direction & movement ----------------------------------------------------

/** Cardinal & common text‑adventure directions. Extend cautiously to avoid traversal injection. */
export type Direction =
    | 'north'
    | 'south'
    | 'east'
    | 'west'
    | 'northeast'
    | 'northwest'
    | 'southeast'
    | 'southwest'
    | 'up'
    | 'down'
    | 'in'
    | 'out'

/** Set of allowed directions for validation / normalization. */
export const DIRECTIONS: readonly Direction[] = [
    'north',
    'south',
    'east',
    'west',
    'northeast',
    'northwest',
    'southeast',
    'southwest',
    'up',
    'down',
    'in',
    'out'
] as const

export function isDirection(value: string): value is Direction {
    return (DIRECTIONS as readonly string[]).includes(value)
}

/** Map of directions to their canonical opposites for bidirectional exit creation */
const OPPOSITE_DIRECTIONS: Readonly<Record<Direction, Direction>> = {
    north: 'south',
    south: 'north',
    east: 'west',
    west: 'east',
    northeast: 'southwest',
    southwest: 'northeast',
    northwest: 'southeast',
    southeast: 'northwest',
    up: 'down',
    down: 'up',
    in: 'out',
    out: 'in'
} as const

/** Get the opposite direction for bidirectional exit creation */
export function getOppositeDirection(direction: Direction): Direction {
    return OPPOSITE_DIRECTIONS[direction]
}

/** An explicit exit edge between two locations. */
export interface ExitEdge {
    /** Source location ID. */
    fromLocationId: string
    /** Destination location ID. */
    toLocationId: string
    /** Travel direction from source to destination. */
    direction: Direction
    /** Optional short flavor text when using this exit. */
    description?: string
    /** Whether movement via this exit is currently blocked (future: reasons/conditions). */
    blocked?: boolean
    /** Optional semantic name for this exit (e.g., "wooden_door", "archway"). N2 feature. */
    name?: string
    /** Optional synonyms for this exit (e.g., ["gate", "entrance"]). N2 feature. */
    synonyms?: string[]
}

// --- Location ----------------------------------------------------------------

/**
 * Location vertex. Exits MAY be represented either as: (a) explicit ExitEdge collection, or (b) a
 * normalized map for quick lookup.
 */
export interface LocationNode {
    id: string
    name: string
    description: string
    /** Sparse mapping from direction to destination location ID. */
    exits?: Partial<Record<Direction, string>>
    /** Tag facets for biome / narrative / faction queries (e.g., 'biome:forest'). */
    tags?: string[]
    /** Version counter for optimistic concurrency (optional). */
    version?: number
    createdAt?: string
    updatedAt?: string
    /** Landmark alias mapping: landmark name -> canonical direction. N2 feature. */
    landmarkAliases?: Record<string, Direction>
}

// --- Player ------------------------------------------------------------------

export interface PlayerState {
    id: string
    name: string
    /** Current location (mirrors (player)-[:in]->(location) edge). */
    currentLocationId: string
    /** Last successful movement direction for relative direction resolution. */
    lastHeading?: Direction
    /** Owned / carried item IDs (if using list based inventory). */
    inventoryItemIds?: string[]
    /** Arbitrary numeric / textual attributes (HP, stamina, etc.). */
    attributes?: Record<string, number | string | boolean>
    createdAt?: string
    updatedAt?: string
}

// --- Items & Inventory -------------------------------------------------------

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export interface ItemEntity {
    id: string
    name: string
    description?: string
    rarity?: ItemRarity
    weight?: number
    /** Where the item resides if not held (location vertex id). */
    locationId?: string
    /** If held by a player (player vertex id). */
    ownerPlayerId?: string
    /** Flexible attributes (damage, durability, etc.). */
    attributes?: Record<string, number | string | boolean>
    createdAt?: string
    updatedAt?: string
}

/** Optional document-based inventory projection for quick retrieval. */
export interface InventorySnapshot {
    playerId: string
    itemIds: string[]
    capacity?: number
    updatedAt?: string
}

// --- World Events ------------------------------------------------------------

/**
 * Legacy WorldEvent types for SQL API persistence.
 *
 * These simple string types ('PlayerMoved', 'LocationDiscovered', etc.) are used for
 * storing event history documents in Cosmos SQL API worldEvents container. They track
 * processing status and support retry logic for persisted event records.
 *
 * For async queue-based event processing, use WorldEventEnvelope from events/worldEventSchema.ts
 * which has namespaced types like 'Player.Move' and full idempotency/traceability support.
 */
export type WorldEventType = 'LocationDiscovered' | 'PlayerMoved' | 'NPCSpawn' | 'ItemSpawn' | 'ItemPickup' | 'ItemDrop' | 'Tick' | 'Custom'

/**
 * Processing status for SQL-persisted event documents.
 * Tracks lifecycle state for retry and completion logic.
 */
export type WorldEventStatus = 'Pending' | 'Processing' | 'Completed' | 'Failed' | 'DeadLettered'

/**
 * Legacy WorldEvent interface for SQL API persistence.
 *
 * This model is used for storing event history documents in Cosmos SQL API worldEvents container.
 * It tracks processing status, supports scheduled events, and maintains retry counters.
 *
 * For async queue-based world evolution, use WorldEventEnvelope from events/worldEventSchema.ts
 * which provides Zod validation, idempotency keys, actor envelopes, and correlation/causation chains.
 * See docs/architecture/world-event-contract.md for the authoritative queue contract specification.
 *
 * Key differences:
 * - WorldEvent: SQL persistence, status tracking, simple type strings ('PlayerMoved')
 * - WorldEventEnvelope: Queue contract, Zod validation, namespaced types ('Player.Move')
 */
export interface WorldEvent<TPayload = unknown> {
    id: string
    type: WorldEventType
    status: WorldEventStatus
    /** Correlation id linking to originating HTTP request or prior event chain. */
    correlationId?: string
    /** ISO timestamp when the event was created. */
    createdAt: string
    /** For scheduled / delayed events. */
    scheduledFor?: string
    /** Processing completion time (optional). */
    completedAt?: string
    /** Contextual payload (schema depends on type). */
    payload: TPayload
    /** Retry attempt counter for transient failures. */
    attempt?: number
}

// --- Type Guards / Helpers ---------------------------------------------------

/**
 * Type guard for legacy SQL-persisted WorldEvent types.
 *
 * Note: This checks simple types like 'PlayerMoved', 'LocationDiscovered'.
 * For queue envelope types like 'Player.Move', 'World.Exit.Create', use
 * WorldEventTypeSchema from events/worldEventSchema.ts instead.
 */
export function isWorldEventType(t: string): t is WorldEventType {
    return ['LocationDiscovered', 'PlayerMoved', 'NPCSpawn', 'ItemSpawn', 'ItemPickup', 'ItemDrop', 'Tick', 'Custom'].includes(t)
}

/**
 * Type guard for SQL-persisted WorldEvent status values.
 */
export function isWorldEventStatus(s: string): s is WorldEventStatus {
    return ['Pending', 'Processing', 'Completed', 'Failed', 'DeadLettered'].includes(s)
}

/** Canonical envelope shape for HTTP responses returning domain data. */
export interface ApiSuccessEnvelope<T> {
    success: true
    data: T
    correlationId?: string
}
export interface ApiErrorEnvelope {
    success: false
    error: { code: string; message: string }
    correlationId?: string
}
export type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope

/** Convenience constructors (no runtime dependency needed elsewhere). */
export const ok = <T>(data: T, correlationId?: string): ApiSuccessEnvelope<T> => ({ success: true, data, correlationId })
export const err = (code: string, message: string, correlationId?: string): ApiErrorEnvelope => ({
    success: false,
    error: { code, message },
    correlationId
})

// --- Realm ------------------------------------------------------------------

/**
 * Realm type enumeration for hierarchical spatial/conceptual groupings.
 * Represents different categories of realms from world-level to dungeon-specific.
 */
export type RealmType =
    | 'WORLD'
    | 'CONTINENT'
    | 'MOUNTAIN_RANGE'
    | 'FOREST'
    | 'KINGDOM'
    | 'CITY'
    | 'DISTRICT'
    | 'WEATHER_ZONE'
    | 'TRADE_NETWORK'
    | 'ALLIANCE'
    | 'DUNGEON'

/** Set of allowed realm types for validation. */
export const REALM_TYPES: readonly RealmType[] = [
    'WORLD',
    'CONTINENT',
    'MOUNTAIN_RANGE',
    'FOREST',
    'KINGDOM',
    'CITY',
    'DISTRICT',
    'WEATHER_ZONE',
    'TRADE_NETWORK',
    'ALLIANCE',
    'DUNGEON'
] as const

/**
 * Realm scope enumeration for hierarchical organization levels.
 * Orders realms from global (world-wide) to micro (smallest units).
 */
export type RealmScope = 'GLOBAL' | 'CONTINENTAL' | 'MACRO' | 'REGIONAL' | 'LOCAL' | 'MICRO'

/** Set of allowed realm scopes for validation. */
export const REALM_SCOPES: readonly RealmScope[] = ['GLOBAL', 'CONTINENTAL', 'MACRO', 'REGIONAL', 'LOCAL', 'MICRO'] as const

/**
 * Realm vertex representing a spatial or conceptual grouping in the world graph.
 * Realms provide hierarchical context for locations via 'within' edges.
 *
 * Label: `realm` (Gremlin vertex)
 *
 * Examples:
 * - Geographic: continents, mountain ranges, forests
 * - Political: kingdoms, cities, districts
 * - Functional: weather zones, trade networks
 * - Narrative: alliances, dungeons
 */
export interface RealmVertex {
    /** Unique identifier (GUID). */
    id: string
    /** Human-readable realm name. */
    name: string
    /** Classification of the realm (geographic, political, functional). */
    realmType: RealmType
    /** Hierarchical level of the realm. */
    scope: RealmScope
    /** Optional narrative description of the realm. */
    description?: string
    /** Optional tags for faceted queries (e.g., ['mysterious', 'ancient']). */
    narrativeTags?: string[]
    /** Optional domain-specific attributes (e.g., climate, government, culturalTraits). */
    properties?: Record<string, unknown>
}

/** Type guard for RealmType validation. */
export function isRealmType(value: string): value is RealmType {
    return (REALM_TYPES as readonly string[]).includes(value)
}

/** Type guard for RealmScope validation. */
export function isRealmScope(value: string): value is RealmScope {
    return (REALM_SCOPES as readonly string[]).includes(value)
}

// --- Realm Edge Types & Properties ------------------------------------------

/**
 * Edge labels for realm relationships in the world graph.
 *
 * Edge semantics:
 * - `within`: Containment hierarchy (Location → Realm, Realm → Realm). Forms a DAG (no cycles).
 * - `member_of`: Overlapping classification (Location → Realm, Realm → Realm). Allows entities to belong to multiple realms.
 * - `borders`: Adjacency between realms (Realm ↔ Realm). Bidirectional/symmetric.
 * - `on_route`: Infrastructure connection (Location → Location). Has routeName property.
 * - `vassal_of`: Political subordination (Realm → Realm). Directional.
 * - `allied_with`: Political alliance (Realm → Realm). Directional.
 * - `at_war_with`: Political conflict (Realm → Realm). Directional.
 */
export type RealmEdgeLabel = 'within' | 'member_of' | 'borders' | 'on_route' | 'vassal_of' | 'allied_with' | 'at_war_with'

/** Set of allowed realm edge labels for validation. */
export const REALM_EDGE_LABELS: readonly RealmEdgeLabel[] = [
    'within',
    'member_of',
    'borders',
    'on_route',
    'vassal_of',
    'allied_with',
    'at_war_with'
] as const

/** Type guard for RealmEdgeLabel validation. */
export function isRealmEdgeLabel(value: string): value is RealmEdgeLabel {
    return (REALM_EDGE_LABELS as readonly string[]).includes(value)
}

/**
 * Edge properties for `on_route` infrastructure connections.
 * Represents named routes/roads connecting locations.
 */
export interface RouteEdge {
    /** Human-readable name of the route (e.g., "The King's Road", "Merchant's Path"). */
    routeName: string
}

// --- Lore / Memory / Canonical Facts ----------------------------------------

/**
 * Canonical fact types for structured world lore storage.
 * Extensible enum for different categories of curated world knowledge.
 */
export type FactType = 'faction' | 'artifact' | 'historical_event' | 'character' | 'location_lore' | 'creature'

/**
 * Canonical world fact for lore-memory MCP server.
 * Immutable world knowledge curated for AI context assembly.
 *
 * Persistence: Cosmos SQL API `loreFacts` container (PK: /type)
 * Access: Read-only via MCP tools (getFact, searchFacts)
 *
 * Version management (ADR-003): Facts support emergent mutations via LLM generation.
 *
 * Versioning Strategy:
 * - Each Cosmos document represents a single version with immutable content per Cosmos ID
 * - `factId` is a stable semantic key that persists across versions (e.g., 'faction_shadow_council')
 * - Edits create new documents with same `factId` but incremented `version` and new Cosmos `id`
 * - Previous versions remain addressable via (factId, version) composite for audit/rollback
 * - `archivedUtc` marks versions that should be excluded from current queries (soft delete for audit)
 * - Deterministic replay uses (factId, version) pairs; lossy rollup uses latest non-archived version
 *
 * Example mutation flow:
 * - V1: id='doc-uuid-1', factId='faction_shadow_council', version=1, fields={...}
 * - V2: id='doc-uuid-2', factId='faction_shadow_council', version=2, fields={...updated by LLM...}
 * - Query getFact('faction_shadow_council') returns V2 (latest non-archived)
 * - Query getFact('faction_shadow_council', version=1) returns V1 for audit
 */
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

/**
 * Minimal search result for lore-memory MCP search-lore tool.
 * Returns ranked snippets rather than full CanonicalFact documents to prevent token bloat.
 *
 * Stable contract: Only this shape is returned by search-lore MCP tool.
 * For full structured fact JSON, use get-canonical-fact tool.
 *
 * Future: Populated by semantic search with embeddings infrastructure.
 */
export interface LoreSearchResult {
    /** Business identifier referencing the canonical fact (e.g., 'faction_shadow_council'). */
    factId: string

    /** Fact type classification ('faction', 'artifact', 'location_lore', etc.). */
    type: FactType

    /** Relevance score from semantic search (0-1 range, higher = more relevant). */
    score: number

    /** Brief text excerpt highlighting match context (guideline: ~200 chars max). */
    snippet: string

    /** Optional: Version number of the fact for audit trails. */
    version?: number
}

// --- Terrain Types ----------------------------------------------------------

/**
 * Terrain type enumeration for spatial generation guidance.
 * Provides contextual hints to AI for expected exit patterns during world expansion.
 */
export type TerrainType = 'open-plain' | 'dense-forest' | 'hilltop' | 'riverbank' | 'narrow-corridor'

// Future extension placeholders:
// - NPC entity model
// - Faction / Governance structures
// - Quest / Dialogue graph types
