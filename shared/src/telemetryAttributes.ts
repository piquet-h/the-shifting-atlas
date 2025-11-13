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
