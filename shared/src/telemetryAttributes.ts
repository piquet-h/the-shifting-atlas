/**
 * Domain-Specific Telemetry Attribute Helpers
 *
 * Provides centralized utilities for attaching structured game.* attributes to telemetry events.
 * Naming convention: game.<domain>.<attribute> (lowercase with dots).
 *
 * Purpose: Improve queryability and correlation by adding gameplay-specific dimensions.
 * See: docs/observability.md - Domain-Specific Attribute Naming Convention
 */

/**
 * Approved domain attribute keys for telemetry events.
 * Use these constants to ensure consistent key naming across the codebase.
 */
export const TELEMETRY_ATTRIBUTE_KEYS = {
    /** Player GUID for identity correlation */
    PLAYER_ID: 'game.player.id',
    /** Location GUID (current or target) */
    LOCATION_ID: 'game.location.id',
    /** Origin location ID for movement */
    LOCATION_FROM: 'game.location.from',
    /** Destination location ID (when resolved) */
    LOCATION_TO: 'game.location.to',
    /** Movement direction (canonical: north, south, east, west, up, down, in, out) */
    EXIT_DIRECTION: 'game.world.exit.direction',
    /** World event type for event processing */
    EVENT_TYPE: 'game.event.type',
    /** Actor type (player, npc, system) */
    EVENT_ACTOR_KIND: 'game.event.actor.kind',
    /** Event scope key (pattern: loc:<id>, player:<id>, global:<category>) */
    EVENT_SCOPE_KEY: 'game.event.scope.key',
    /** Event correlation ID (UUID) */
    EVENT_CORRELATION_ID: 'game.event.correlation.id',
    /** Operation ID from Azure Functions invocation */
    EVENT_OPERATION_ID: 'game.event.operation.id',
    /** Processing latency in milliseconds */
    EVENT_PROCESSING_LATENCY_MS: 'game.event.processing.latency.ms',
    /** Service Bus queue depth (optional) */
    EVENT_QUEUE_DEPTH: 'game.event.queue.depth',
    /** Retry count for failed events */
    EVENT_RETRY_COUNT: 'game.event.retry.count',
    /** Batch ID for batch processing correlation */
    EVENT_BATCH_ID: 'game.event.batch.id',
    /** Domain error classification */
    ERROR_CODE: 'game.error.code',
    /** Humor quip identifier (UUID) */
    HUMOR_QUIP_ID: 'game.humor.quip.id',
    /** Player action type that triggered humor */
    HUMOR_ACTION_TYPE: 'game.humor.action.type',
    /** Probability value used for humor gate (0.0-1.0) */
    HUMOR_PROBABILITY_USED: 'game.humor.probability.used',
    /** Reason for quip suppression (serious|exhausted|probability) */
    HUMOR_SUPPRESSION_REASON: 'game.humor.suppression.reason'
} as const

export type TelemetryAttributeKey = (typeof TELEMETRY_ATTRIBUTE_KEYS)[keyof typeof TELEMETRY_ATTRIBUTE_KEYS]

/**
 * Options for enriching player-related events
 */
export interface PlayerEventAttributes {
    playerId?: string | null
}

/**
 * Options for enriching movement/navigation events
 */
export interface MovementEventAttributes {
    playerId?: string | null
    fromLocationId?: string | null
    toLocationId?: string | null
    exitDirection?: string | null
}

/**
 * Options for enriching world event processing events
 */
export interface WorldEventAttributes {
    eventType?: string | null
    actorKind?: string | null
    targetLocationId?: string | null
    targetPlayerId?: string | null
}

/**
 * Options for enriching world event lifecycle telemetry (Issue #395)
 * Used for World.Event.Emitted, World.Event.Processed, World.Event.Failed, World.Event.Retried
 */
export interface WorldEventLifecycleAttributes {
    eventType?: string | null
    scopeKey?: string | null
    correlationId?: string | null
    operationId?: string | null
    processingLatencyMs?: number | null
    queueDepth?: number | null
    errorCode?: string | null
    retryCount?: number | null
    batchId?: string | null
}

/**
 * Options for enriching error events
 */
export interface ErrorEventAttributes {
    errorCode?: string | null
}

/**
 * Options for enriching humor (DM) events
 */
export interface HumorEventAttributes {
    quipId?: string | null
    actionType?: string | null
    probabilityUsed?: number | null
    suppressionReason?: string | null
}

/**
 * Enrich telemetry properties with player attributes.
 * Omits attributes if values are null/undefined (conditional presence).
 *
 * @param properties - Base telemetry properties object (will be mutated)
 * @param attrs - Player attribute values
 * @returns The mutated properties object for chaining
 */
export function enrichPlayerAttributes(properties: Record<string, unknown>, attrs: PlayerEventAttributes): Record<string, unknown> {
    if (attrs.playerId) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.PLAYER_ID] = attrs.playerId
    }
    return properties
}

/**
 * Enrich telemetry properties with movement/navigation attributes.
 * Includes player ID, location IDs, and exit direction.
 * Omits attributes if values are null/undefined (conditional presence).
 *
 * @param properties - Base telemetry properties object (will be mutated)
 * @param attrs - Movement attribute values
 * @returns The mutated properties object for chaining
 */
export function enrichMovementAttributes(properties: Record<string, unknown>, attrs: MovementEventAttributes): Record<string, unknown> {
    if (attrs.playerId) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.PLAYER_ID] = attrs.playerId
    }
    if (attrs.fromLocationId) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.LOCATION_FROM] = attrs.fromLocationId
    }
    if (attrs.toLocationId) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.LOCATION_TO] = attrs.toLocationId
    }
    if (attrs.exitDirection) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.EXIT_DIRECTION] = attrs.exitDirection
    }
    return properties
}

/**
 * Enrich telemetry properties with world event processing attributes.
 * Includes event type, actor kind, and target entity IDs.
 * Omits attributes if values are null/undefined (conditional presence).
 *
 * @param properties - Base telemetry properties object (will be mutated)
 * @param attrs - World event attribute values
 * @returns The mutated properties object for chaining
 */
export function enrichWorldEventAttributes(properties: Record<string, unknown>, attrs: WorldEventAttributes): Record<string, unknown> {
    if (attrs.eventType) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.EVENT_TYPE] = attrs.eventType
    }
    if (attrs.actorKind) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.EVENT_ACTOR_KIND] = attrs.actorKind
    }
    if (attrs.targetLocationId) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.LOCATION_ID] = attrs.targetLocationId
    }
    if (attrs.targetPlayerId) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.PLAYER_ID] = attrs.targetPlayerId
    }
    return properties
}

/**
 * Enrich telemetry properties with error attributes.
 * Adds domain error classification code.
 * Omits attributes if values are null/undefined (conditional presence).
 *
 * @param properties - Base telemetry properties object (will be mutated)
 * @param attrs - Error attribute values
 * @returns The mutated properties object for chaining
 */
export function enrichErrorAttributes(properties: Record<string, unknown>, attrs: ErrorEventAttributes): Record<string, unknown> {
    if (attrs.errorCode) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.ERROR_CODE] = attrs.errorCode
    }
    return properties
}

/**
 * Enrich telemetry properties with humor (DM) attributes.
 * Includes quip ID, action type, probability, and suppression reason.
 * Omits attributes if values are null/undefined (conditional presence).
 *
 * @param properties - Base telemetry properties object (will be mutated)
 * @param attrs - Humor attribute values
 * @returns The mutated properties object for chaining
 */
export function enrichHumorAttributes(properties: Record<string, unknown>, attrs: HumorEventAttributes): Record<string, unknown> {
    if (attrs.quipId) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.HUMOR_QUIP_ID] = attrs.quipId
    }
    if (attrs.actionType) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.HUMOR_ACTION_TYPE] = attrs.actionType
    }
    if (attrs.probabilityUsed !== null && attrs.probabilityUsed !== undefined) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.HUMOR_PROBABILITY_USED] = attrs.probabilityUsed
    }
    if (attrs.suppressionReason) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.HUMOR_SUPPRESSION_REASON] = attrs.suppressionReason
    }
    return properties
}

/**
 * Enrich telemetry properties with world event lifecycle attributes.
 * Used for World.Event.Emitted, World.Event.Processed, World.Event.Failed, World.Event.Retried.
 * Includes event type, scope key, correlation/operation IDs, latency, queue depth, retry count, and batch ID.
 * Handles edge cases per Issue #395:
 * - Processing latency capped at Int32.MAX (2147483647ms) to prevent overflow
 * - Missing correlationId indicated by unknownCorrelation flag (not added as attribute)
 * Omits attributes if values are null/undefined (conditional presence).
 *
 * @param properties - Base telemetry properties object (will be mutated)
 * @param attrs - World event lifecycle attribute values
 * @returns The mutated properties object for chaining
 */
export function enrichWorldEventLifecycleAttributes(
    properties: Record<string, unknown>,
    attrs: WorldEventLifecycleAttributes
): Record<string, unknown> {
    if (attrs.eventType) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.EVENT_TYPE] = attrs.eventType
    }
    if (attrs.scopeKey) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.EVENT_SCOPE_KEY] = attrs.scopeKey
    }
    if (attrs.correlationId) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.EVENT_CORRELATION_ID] = attrs.correlationId
    } else if (attrs.correlationId === null) {
        // Edge case: missing correlationId → emit event with unknownCorrelation flag
        properties['unknownCorrelation'] = true
    }
    if (attrs.operationId) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.EVENT_OPERATION_ID] = attrs.operationId
    }
    if (attrs.processingLatencyMs !== null && attrs.processingLatencyMs !== undefined) {
        // Edge case: cap at Int32.MAX to prevent overflow (Issue #395)
        const INT32_MAX = 2147483647
        const cappedLatency = Math.min(attrs.processingLatencyMs, INT32_MAX)
        properties[TELEMETRY_ATTRIBUTE_KEYS.EVENT_PROCESSING_LATENCY_MS] = cappedLatency
    }
    if (attrs.queueDepth !== null && attrs.queueDepth !== undefined) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.EVENT_QUEUE_DEPTH] = attrs.queueDepth
    }
    if (attrs.errorCode) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.ERROR_CODE] = attrs.errorCode
    }
    if (attrs.retryCount !== null && attrs.retryCount !== undefined) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.EVENT_RETRY_COUNT] = attrs.retryCount
    }
    if (attrs.batchId) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.EVENT_BATCH_ID] = attrs.batchId
    }
    return properties
}
