/**
 * Processed Event Repository Interface
 *
 * Purpose: Durable idempotency registry for world event processing.
 * Ensures ≥99.9% duplicate suppression rate across processor restarts.
 *
 * Partition Strategy: PK = /idempotencyKey for efficient lookups
 * TTL: 7 days default (configurable via PROCESSED_EVENTS_TTL_SECONDS)
 *
 * Design: Composite idempotency key from correlationId + eventType + scopeKey
 * ensures uniqueness for logical action instances across the event space.
 *
 * Fallback: Registry lookup failures → proceed with processing (availability over consistency)
 */

/**
 * Processed event record stored in SQL API for idempotency tracking.
 *
 * Key Design Principles:
 * - Immutable after creation (append-only)
 * - Automatic TTL expiration (7 days default)
 * - Partition key = idempotencyKey for efficient duplicate detection
 * - Supports correlation tracking for audit trails
 */
export interface ProcessedEventRecord {
    /** Unique record identifier (GUID) - used as document id */
    id: string

    /** Composite idempotency key from correlationId + eventType + scopeKey */
    idempotencyKey: string

    /** Original event ID from the WorldEventEnvelope */
    eventId: string

    /** Event type from envelope (e.g., 'Player.Move') */
    eventType: string

    /** Correlation ID from envelope */
    correlationId: string

    /** ISO 8601 timestamp when event was first processed */
    processedUtc: string

    /** Actor kind from envelope (player, npc, system, ai) */
    actorKind: string

    /** Actor ID if applicable (player/NPC GUID) */
    actorId?: string

    /** Schema version for backward compatibility */
    version: number

    /** TTL in seconds (set by container default or explicitly) */
    ttl?: number
}

/**
 * Repository interface for processed event operations.
 */
export interface IProcessedEventRepository {
    /**
     * Mark an event as processed by storing its idempotency key.
     * @param record - Processed event record to store
     * @returns The stored record
     */
    markProcessed(record: ProcessedEventRecord): Promise<ProcessedEventRecord>

    /**
     * Check if an event has been processed (duplicate detection).
     * @param idempotencyKey - Idempotency key to check
     * @returns The existing record if found, null if not processed
     */
    checkProcessed(idempotencyKey: string): Promise<ProcessedEventRecord | null>

    /**
     * Get a specific processed event by ID (for debugging).
     * @param id - Record ID
     * @param idempotencyKey - Idempotency key (partition key)
     * @returns The processed event record or null if not found
     */
    getById(id: string, idempotencyKey: string): Promise<ProcessedEventRecord | null>
}

/**
 * Utility: Build composite idempotency key from envelope fields.
 * Pattern: correlationId:eventType:scopeKey
 *
 * @param correlationId - Correlation ID from envelope
 * @param eventType - Event type from envelope
 * @param scopeKey - Scope key (e.g., 'loc:<id>', 'player:<id>')
 * @returns Composite idempotency key
 */
export function buildIdempotencyKey(correlationId: string, eventType: string, scopeKey: string): string {
    return `${correlationId}:${eventType}:${scopeKey}`
}

/**
 * Utility: Parse composite idempotency key into components.
 * @param idempotencyKey - Composite idempotency key
 * @returns Parsed components or null if invalid format
 */
export function parseIdempotencyKey(idempotencyKey: string): {
    correlationId: string
    eventType: string
    scopeKey: string
} | null {
    const parts = idempotencyKey.split(':')
    if (parts.length < 3) return null

    // Handle scopeKey that may contain colons (e.g., 'loc:abc123...')
    const correlationId = parts[0]
    const eventType = parts[1]
    const scopeKey = parts.slice(2).join(':')

    return { correlationId, eventType, scopeKey }
}
