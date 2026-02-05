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
    HUMOR_SUPPRESSION_REASON: 'game.humor.suppression.reason',
    // Frontend telemetry attributes (Issue #444 - Frontend Telemetry Integration)
    /** Session ID for frontend session correlation */
    SESSION_ID: 'game.session.id',
    /** Microsoft Account user ID (Azure SWA auth) */
    USER_ID: 'game.user.id',
    /** Action type for player interaction classification */
    ACTION_TYPE: 'game.action.type',
    /** Latency in milliseconds for API calls or user actions */
    LATENCY_MS: 'game.latency.ms',
    // Hero prose (Description.Hero) attributes (Issue #738 - Hero Prose Telemetry)
    /** Outcome reason for hero prose generation (timeout|throttled|error|config-missing|invalid-response) */
    HERO_OUTCOME_REASON: 'game.description.hero.outcome.reason',
    /** Model/deployment name for hero prose generation */
    HERO_MODEL: 'game.description.hero.model',
    /** Token usage for hero prose generation */
    HERO_TOKEN_USAGE: 'game.description.hero.token.usage',
    // MCP (Model Context Protocol) attributes (M4 AI Read - Issue #428)
    /** MCP tool name being invoked */
    MCP_TOOL_NAME: 'game.mcp.tool.name',
    /** Client application ID (Azure AD app ID or subscription-level identifier) */
    MCP_CLIENT_APP_ID: 'game.mcp.client.app.id',
    /** Client subscription ID (Azure subscription ID) */
    MCP_CLIENT_SUBSCRIPTION_ID: 'game.mcp.client.subscription.id',
    /** MCP auth result (allowed|denied) */
    MCP_AUTH_RESULT: 'game.mcp.auth.result',
    /** Throttle/rate-limit reason */
    MCP_THROTTLE_REASON: 'game.mcp.throttle.reason',
    /** MCP failure reason (unexpected errors) */
    MCP_FAILURE_REASON: 'game.mcp.failure.reason'
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

/**
 * Options for enriching frontend session events
 */
export interface SessionEventAttributes {
    sessionId?: string | null
    userId?: string | null
}

/**
 * Options for enriching frontend action events
 */
export interface ActionEventAttributes {
    sessionId?: string | null
    userId?: string | null
    actionType?: string | null
    latencyMs?: number | null
    correlationId?: string | null
}

/**
 * Options for enriching frontend error events
 */
export interface FrontendErrorEventAttributes {
    sessionId?: string | null
    userId?: string | null
    errorCode?: string | null
}

/**
 * Enrich telemetry properties with session attributes.
 * Omits attributes if values are null/undefined (conditional presence).
 *
 * @param properties - Base telemetry properties object (will be mutated)
 * @param attrs - Session attribute values
 * @returns The mutated properties object for chaining
 */
export function enrichSessionAttributes(properties: Record<string, unknown>, attrs: SessionEventAttributes): Record<string, unknown> {
    if (attrs.sessionId) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.SESSION_ID] = attrs.sessionId
    }
    if (attrs.userId) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.USER_ID] = attrs.userId
    }
    return properties
}

/**
 * Enrich telemetry properties with action attributes.
 * Includes session ID, user ID, action type, latency, and correlation ID.
 * Omits attributes if values are null/undefined (conditional presence).
 *
 * @param properties - Base telemetry properties object (will be mutated)
 * @param attrs - Action attribute values
 * @returns The mutated properties object for chaining
 */
export function enrichActionAttributes(properties: Record<string, unknown>, attrs: ActionEventAttributes): Record<string, unknown> {
    if (attrs.sessionId) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.SESSION_ID] = attrs.sessionId
    }
    if (attrs.userId) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.USER_ID] = attrs.userId
    }
    if (attrs.actionType) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.ACTION_TYPE] = attrs.actionType
    }
    if (attrs.latencyMs !== null && attrs.latencyMs !== undefined) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.LATENCY_MS] = attrs.latencyMs
    }
    if (attrs.correlationId) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.EVENT_CORRELATION_ID] = attrs.correlationId
    }
    return properties
}

/**
 * Enrich telemetry properties with frontend error attributes.
 * Includes session ID, user ID, and error code.
 * Omits attributes if values are null/undefined (conditional presence).
 *
 * @param properties - Base telemetry properties object (will be mutated)
 * @param attrs - Error attribute values
 * @returns The mutated properties object for chaining
 */
export function enrichFrontendErrorAttributes(
    properties: Record<string, unknown>,
    attrs: FrontendErrorEventAttributes
): Record<string, unknown> {
    if (attrs.sessionId) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.SESSION_ID] = attrs.sessionId
    }
    if (attrs.userId) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.USER_ID] = attrs.userId
    }
    if (attrs.errorCode) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.ERROR_CODE] = attrs.errorCode
    }
    return properties
}

/**
 * Options for enriching hero prose telemetry events
 * Used for Description.Hero.CacheHit, Description.Hero.CacheMiss,
 * Description.Hero.Generate.Success, Description.Hero.Generate.Failure
 */
export interface HeroProseEventAttributes {
    locationId?: string | null
    latencyMs?: number | null
    outcomeReason?: string | null
    model?: string | null
    tokenUsage?: number | null
}

/**
 * Enrich telemetry properties with hero prose attributes.
 * Used for hero prose cache and generation events.
 * Includes locationId, latency, outcome reason, model, and token usage.
 * Omits attributes if values are null/undefined (conditional presence).
 *
 * Redaction rules (Issue #738):
 * - NEVER include raw prompts or generated prose content
 * - Model name should be bounded deployment name (not dynamic user input)
 * - Outcome reasons must be low-cardinality (timeout|throttled|error|config-missing|invalid-response)
 *
 * @param properties - Base telemetry properties object (will be mutated)
 * @param attrs - Hero prose attribute values
 * @returns The mutated properties object for chaining
 */
export function enrichHeroProseAttributes(properties: Record<string, unknown>, attrs: HeroProseEventAttributes): Record<string, unknown> {
    if (attrs.locationId) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.LOCATION_ID] = attrs.locationId
    }
    if (attrs.latencyMs !== null && attrs.latencyMs !== undefined) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.LATENCY_MS] = attrs.latencyMs
    }
    if (attrs.outcomeReason) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.HERO_OUTCOME_REASON] = attrs.outcomeReason
    }
    if (attrs.model) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.HERO_MODEL] = attrs.model
    }
    if (attrs.tokenUsage !== null && attrs.tokenUsage !== undefined) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.HERO_TOKEN_USAGE] = attrs.tokenUsage
    }
    return properties
}

/**
 * Options for enriching MCP (Model Context Protocol) events
 * Used for MCP.Tool.Invoked, MCP.Auth.Allowed, MCP.Auth.Denied, MCP.Throttled, MCP.Failed
 */
export interface MCPEventAttributes {
    toolName?: string | null
    clientAppId?: string | null
    clientSubscriptionId?: string | null
    authResult?: string | null
    throttleReason?: string | null
    failureReason?: string | null
    latencyMs?: number | null
}

/**
 * Enrich telemetry properties with MCP (Model Context Protocol) attributes.
 * Used for tool invocations, auth decisions, throttling, and failures.
 * Includes tool name, client identity (appId/subscriptionId only - NO tokens/keys), results, and latency.
 * Omits attributes if values are null/undefined (conditional presence).
 *
 * Redaction rules (Issue #428):
 * - NEVER include access tokens, API keys, or secrets
 * - Client identity as appId/subscriptionId only (Azure AD app ID or subscription ID)
 * - No user-level PII beyond what's in standard Azure audit logs
 *
 * @param properties - Base telemetry properties object (will be mutated)
 * @param attrs - MCP attribute values
 * @returns The mutated properties object for chaining
 */
export function enrichMCPAttributes(properties: Record<string, unknown>, attrs: MCPEventAttributes): Record<string, unknown> {
    if (attrs.toolName) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.MCP_TOOL_NAME] = attrs.toolName
    }
    if (attrs.clientAppId) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.MCP_CLIENT_APP_ID] = attrs.clientAppId
    }
    if (attrs.clientSubscriptionId) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.MCP_CLIENT_SUBSCRIPTION_ID] = attrs.clientSubscriptionId
    }
    if (attrs.authResult) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.MCP_AUTH_RESULT] = attrs.authResult
    }
    if (attrs.throttleReason) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.MCP_THROTTLE_REASON] = attrs.throttleReason
    }
    if (attrs.failureReason) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.MCP_FAILURE_REASON] = attrs.failureReason
    }
    if (attrs.latencyMs !== null && attrs.latencyMs !== undefined) {
        properties[TELEMETRY_ATTRIBUTE_KEYS.LATENCY_MS] = attrs.latencyMs
    }
    return properties
}
