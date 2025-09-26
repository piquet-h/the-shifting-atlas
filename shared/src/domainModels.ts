/**
 * Core domain model types for the Shifting Atlas world graph.
 *
 * Gremlin edge semantics (conceptual):
 *  (room)-[:exit { direction }]->(room)          // Directional exits between rooms
 *  (player)-[:in]->(room)                        // Player currently located in a room (mirrored by currentRoomId prop)
 *  (item)-[:located_in]->(room)                  // Dropped / placed item location
 *  (item)-[:held_by]->(player)                   // Item in player inventory (alternative to list-based inventory)
 *  (event)-[:targets]->(room|player|item|npc)    // WorldEvent target relationships (future use)
 *
 * IDs: All IDs are GUID/UUID style strings (runtime generation not enforced here).
 * Time fields are ISO 8601 strings (UTC) to stay serialization friendly across Functions & frontend.
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

/** An explicit exit edge between two rooms. */
export interface ExitEdge {
    /** Source room ID. */
    fromRoomId: string
    /** Destination room ID. */
    toRoomId: string
    /** Travel direction from source to destination. */
    direction: Direction
    /** Optional short flavor text when using this exit. */
    description?: string
    /** Whether movement via this exit is currently blocked (future: reasons/conditions). */
    blocked?: boolean
}

// --- Room --------------------------------------------------------------------

/**
 * Room vertex. Exits MAY be represented either as: (a) explicit ExitEdge collection, or (b) a
 * normalized map for quick lookup. We retain the existing RoomExit[] (legacy) in room.ts for
 * backward compatibility; new logic should prefer exitMap / exitIds.
 */
export interface RoomNode {
    id: string
    name: string
    description: string
    /** Sparse mapping from direction to destination room ID. */
    exits?: Partial<Record<Direction, string>>
    /** Tag facets for biome / narrative / faction queries (e.g., 'biome:forest'). */
    tags?: string[]
    /** Version counter for optimistic concurrency (optional). */
    version?: number
    createdAt?: string
    updatedAt?: string
}

// --- Player ------------------------------------------------------------------

export interface PlayerState {
    id: string
    name: string
    /** Current room (mirrors (player)-[:in]->(room) edge). */
    currentRoomId: string
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
    /** Where the item resides if not held (room vertex id). */
    locationRoomId?: string
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

export type WorldEventType = 'RoomDiscovered' | 'PlayerMoved' | 'NPCSpawn' | 'ItemSpawn' | 'ItemPickup' | 'ItemDrop' | 'Tick' | 'Custom'

export type WorldEventStatus = 'Pending' | 'Processing' | 'Completed' | 'Failed' | 'DeadLettered'

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

export function isWorldEventType(t: string): t is WorldEventType {
    return ['RoomDiscovered', 'PlayerMoved', 'NPCSpawn', 'ItemSpawn', 'ItemPickup', 'ItemDrop', 'Tick', 'Custom'].includes(t)
}

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
    error: {code: string; message: string}
    correlationId?: string
}
export type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope

/** Convenience constructors (no runtime dependency needed elsewhere). */
export const ok = <T>(data: T, correlationId?: string): ApiSuccessEnvelope<T> => ({success: true, data, correlationId})
export const err = (code: string, message: string, correlationId?: string): ApiErrorEnvelope => ({
    success: false,
    error: {code, message},
    correlationId
})

// Future extension placeholders:
// - NPC entity model
// - Faction / Governance structures
// - Quest / Dialogue graph types
