/**
 * TemporalLedgerEntry - Immutable audit log for temporal events
 *
 * Purpose: Durable audit trail for all temporal events (world clock advancement,
 * player actions, drift, reconciliation) complementing Application Insights telemetry.
 *
 * Container: `temporalLedger` in Cosmos SQL API
 * Partition key: `/scopeKey` (pattern: `wc` for world clock, `player:<id>` for player events)
 * TTL: Configurable via TEMPORAL_LEDGER_TTL_DAYS (default: 90 days)
 *
 * Per ADR-002 principles: Immutable event log with efficient partition isolation.
 */

/**
 * Event types logged in the temporal ledger
 */
export type TemporalEventType = 'WorldClockAdvanced' | 'PlayerActionAdvanced' | 'PlayerDriftApplied' | 'Reconciled'

/**
 * Reconciliation method used when aligning player and location clocks
 */
export type ReconciliationMethod = 'wait' | 'slow' | 'compress'

/**
 * Temporal ledger entry document
 */
export interface TemporalLedgerEntry {
    /** Document unique identifier (GUID) */
    id: string

    /**
     * Partition key for efficient query routing
     * Patterns:
     * - `wc` - World clock events (global)
     * - `player:<playerId>` - Player-specific events (one partition per player)
     */
    scopeKey: string

    /** Type of temporal event */
    eventType: TemporalEventType

    /** ISO 8601 timestamp when event occurred */
    timestamp: string

    /** World clock tick value at time of event (milliseconds since epoch or game-relative) */
    worldClockTick: number

    /** Actor ID (playerId or 'system') - optional for system events */
    actorId?: string

    /** Location ID where event occurred - optional */
    locationId?: string

    /** Duration in milliseconds (for action advances) - optional */
    durationMs?: number

    /** Reconciliation method used (for reconciliation events) - optional */
    reconciliationMethod?: ReconciliationMethod

    /** Flexible metadata for event-specific details - optional */
    metadata?: Record<string, unknown>
}

/**
 * Build scope key for world clock events
 * @returns World clock scope key (`wc`)
 */
export function buildWcScopeKey(): string {
    return 'wc'
}

/**
 * Build scope key for player-specific events
 * @param playerId - Player unique identifier
 * @returns Player scope key (`player:<playerId>`)
 */
export function buildPlayerScopeKey(playerId: string): string {
    return `player:${playerId}`
}

/**
 * Parse scope key to determine type and extract ID if applicable
 * @param scopeKey - Scope key to parse
 * @returns Object with type and optional playerId
 */
export function parseScopeKey(scopeKey: string): { type: 'wc' | 'player'; playerId?: string } {
    if (scopeKey === 'wc') {
        return { type: 'wc' }
    }

    if (scopeKey.startsWith('player:')) {
        const playerId = scopeKey.substring('player:'.length)
        return { type: 'player', playerId }
    }

    throw new Error(`Invalid temporal ledger scope key: ${scopeKey}`)
}
