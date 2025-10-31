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
 * Two distinct WorldEvent-related models exist for different persistence patterns:
 *
 * 1. **WorldEvent interface (this file)**: PLANNED SQL API persistence model for event history audit/replay.
 *    - Purpose: Long-term event log storage in Cosmos SQL API worldEvents container (not yet implemented)
 *    - Type system: Simple strings ('PlayerMoved', 'LocationDiscovered')
 *    - Features: Status tracking (Pending/Processing/Completed/Failed), retry counters, scheduled execution
 *    - Use case: Future audit log, replay scenarios, compliance/debugging
 *    - Status: Container provisioned in infrastructure, implementation deferred
 *
 * 2. **WorldEventEnvelope (events/worldEventSchema.ts)**: ACTIVE queue contract for async world evolution.
 *    - Purpose: Real-time event processing via Service Bus queues (fully implemented)
 *    - Type system: Namespaced types ('Player.Move', 'World.Exit.Create')
 *    - Features: Zod validation, idempotency keys, actor envelopes, causation chains
 *    - Use case: Async processors, AI/NPC event ingestion, world state mutations
 *    - Status: Operational with queue processor at backend/src/functions/queueProcessWorldEvent.ts
 *
 * See docs/architecture/world-event-contract.md for complete WorldEventEnvelope specification.
 * See docs/ambiguities.md for detailed rationale on dual-model separation.
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

// Future extension placeholders:
// - NPC entity model
// - Faction / Governance structures
// - Quest / Dialogue graph types
