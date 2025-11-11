/**
 * World Event repository interface and types for SQL API persistence.
 * Partition strategy: PK = /scopeKey for efficient timeline queries per scope.
 *
 * Purpose: Store immutable event history for audit, replay, and timeline queries.
 * Performance target: Timeline queries complete in ≤200ms for 1000-event scope.
 *
 * Scope Key Patterns:
 * - `loc:<locationId>` - Events scoped to a location
 * - `player:<playerId>` - Events scoped to a player
 * - `global:<category>` - System-wide events (e.g., 'global:maintenance', 'global:tick')
 *
 * This model is distinct from WorldEventEnvelope (queue contract):
 * - WorldEventRecord: SQL persistence for event history (this file)
 * - WorldEventEnvelope: Queue-based async processing (events/worldEventSchema.ts)
 *
 * See docs/architecture/world-event-contract.md for the complete event contract.
 */

/**
 * Event status for SQL-persisted event records.
 * Tracks processing lifecycle state.
 */
export type EventStatus = 'pending' | 'processed' | 'failed' | 'dead_lettered'

/**
 * World event record stored in SQL API for event history.
 *
 * Key Design Principles:
 * - Immutable after creation (append-only log)
 * - Partition key (scopeKey) enables efficient time-range queries
 * - Stores both envelope metadata and processed results
 * - Supports causation chains via correlationId/causationId
 */
export interface WorldEventRecord {
    /** Unique event identifier (GUID) - matches eventId from envelope */
    id: string

    /** Scope key for partition (e.g., 'loc:<id>', 'player:<id>', 'global:<category>') */
    scopeKey: string

    /** Event type namespace (e.g., 'Player.Move', 'World.Exit.Create') */
    eventType: string

    /** Event status tracking */
    status: EventStatus

    /** ISO 8601 timestamp when event occurred (producer clock) */
    occurredUtc: string

    /** ISO 8601 timestamp when event was ingested/persisted */
    ingestedUtc: string

    /** ISO 8601 timestamp when processing completed (null if pending/failed) */
    processedUtc?: string

    /** Actor kind (player, npc, system, ai) */
    actorKind: string

    /** Actor ID if applicable (player/NPC GUID) */
    actorId?: string

    /** Correlation ID linking to originating request or event chain */
    correlationId: string

    /** Causation ID linking to upstream event (optional) */
    causationId?: string

    /** Idempotency key from envelope */
    idempotencyKey: string

    /** Event payload (type-specific data) */
    payload: Record<string, unknown>

    /** Processing result metadata (error message, RU cost, etc.) */
    processingMetadata?: Record<string, unknown>

    /** Schema version for backward compatibility */
    version: number
}

/**
 * Query options for timeline retrieval.
 */
export interface TimelineQueryOptions {
    /** Maximum number of events to return (default: 100) */
    limit?: number

    /** Filter by event status */
    status?: EventStatus

    /** Filter events after this timestamp (ISO 8601) */
    afterTimestamp?: string

    /** Filter events before this timestamp (ISO 8601) */
    beforeTimestamp?: string

    /** Order by occurredUtc (default: desc) */
    order?: 'asc' | 'desc'
}

/**
 * Result metadata for timeline queries.
 */
export interface TimelineQueryResult {
    /** Retrieved events */
    events: WorldEventRecord[]

    /** Total RU charge for the query */
    ruCharge: number

    /** Query latency in milliseconds */
    latencyMs: number

    /** Whether more events exist beyond the limit */
    hasMore: boolean
}

/**
 * Repository interface for world event persistence operations.
 */
export interface IWorldEventRepository {
    /**
     * Persist a new event record (append-only).
     * @param event - World event record to persist
     * @returns The persisted event record
     */
    create(event: WorldEventRecord): Promise<WorldEventRecord>

    /**
     * Update event status and metadata (e.g., mark as processed).
     * @param eventId - Event ID
     * @param scopeKey - Scope key (partition key)
     * @param updates - Partial updates (status, processedUtc, processingMetadata)
     * @returns The updated event record or null if not found
     */
    updateStatus(
        eventId: string,
        scopeKey: string,
        updates: Pick<WorldEventRecord, 'status'> & Partial<Pick<WorldEventRecord, 'processedUtc' | 'processingMetadata'>>
    ): Promise<WorldEventRecord | null>

    /**
     * Get a specific event by ID.
     * @param eventId - Event ID
     * @param scopeKey - Scope key (partition key)
     * @returns The event record or null if not found
     */
    getById(eventId: string, scopeKey: string): Promise<WorldEventRecord | null>

    /**
     * Query events for a specific scope (single-partition query).
     * Performance target: ≤200ms for 1000 events in scope.
     * @param scopeKey - Scope key (partition key)
     * @param options - Query filters and pagination
     * @returns Timeline query result with events and metadata
     */
    queryByScope(scopeKey: string, options?: TimelineQueryOptions): Promise<TimelineQueryResult>

    /**
     * Get recent events across all scopes (cross-partition query, expensive).
     * Use sparingly - prefer queryByScope for targeted queries.
     * @param limit - Maximum number of recent events (default: 100)
     * @returns Array of recent events sorted by occurredUtc desc
     */
    getRecent(limit?: number): Promise<WorldEventRecord[]>

    /**
     * Get event by idempotency key (cross-partition query, expensive).
     * Used for deduplication checks when scope is unknown.
     * @param idempotencyKey - Idempotency key to search
     * @returns The event record or null if not found
     */
    getByIdempotencyKey(idempotencyKey: string): Promise<WorldEventRecord | null>
}

/**
 * Utility: Build scope key for location events.
 * @param locationId - Location GUID
 * @returns Scope key string (e.g., 'loc:abc123...')
 */
export function buildLocationScopeKey(locationId: string): string {
    return `loc:${locationId}`
}

/**
 * Utility: Build scope key for player events.
 * @param playerId - Player GUID
 * @returns Scope key string (e.g., 'player:abc123...')
 */
export function buildPlayerScopeKey(playerId: string): string {
    return `player:${playerId}`
}

/**
 * Utility: Build scope key for global system events.
 * @param category - Event category (e.g., 'maintenance', 'tick')
 * @returns Scope key string (e.g., 'global:maintenance')
 */
export function buildGlobalScopeKey(category: string): string {
    return `global:${category}`
}

/**
 * Utility: Parse scope key into components.
 * @param scopeKey - Scope key string
 * @returns Parsed scope components or null if invalid format
 */
export function parseScopeKey(scopeKey: string): { type: 'loc' | 'player' | 'global'; id: string } | null {
    const match = scopeKey.match(/^(loc|player|global):(.+)$/)
    if (!match) return null

    return {
        type: match[1] as 'loc' | 'player' | 'global',
        id: match[2]
    }
}
