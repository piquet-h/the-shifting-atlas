/**
 * Temporal Ledger Repository - Interface and types
 *
 * Repository for immutable temporal event logging in Cosmos SQL API.
 * Provides audit trail for world clock advancement, player actions, drift, and reconciliation.
 *
 * Container: `temporalLedger` (PK: `/scopeKey`)
 * TTL: Configurable via TEMPORAL_LEDGER_TTL_DAYS (default: 90 days)
 */

import type { TemporalLedgerEntry } from '@piquet-h/shared'

/**
 * Query options for time range queries
 */
export interface TimeRangeQueryOptions {
    /** Start timestamp (ISO 8601) - inclusive */
    startTimestamp: string

    /** End timestamp (ISO 8601) - inclusive */
    endTimestamp: string

    /** Optional maximum number of results */
    maxResults?: number
}

/**
 * Repository interface for temporal ledger operations
 */
export interface ITemporalLedgerRepository {
    /**
     * Log a temporal event (idempotent via upsert)
     * @param entry - Temporal ledger entry to log
     * @returns The logged entry
     */
    log(entry: TemporalLedgerEntry): Promise<TemporalLedgerEntry>

    /**
     * Query events for a specific player
     * @param playerId - Player unique identifier
     * @param maxResults - Optional maximum number of results (default: 100)
     * @returns Array of temporal ledger entries for the player, ordered by timestamp descending
     */
    queryByPlayer(playerId: string, maxResults?: number): Promise<TemporalLedgerEntry[]>

    /**
     * Query world clock advancement events
     * @param maxResults - Optional maximum number of results (default: 100)
     * @returns Array of world clock events, ordered by timestamp descending
     */
    queryByWorldClock(maxResults?: number): Promise<TemporalLedgerEntry[]>

    /**
     * Query events within a specific time range
     * @param options - Time range query options
     * @returns Array of temporal ledger entries within the range, ordered by timestamp descending
     */
    queryByTimeRange(options: TimeRangeQueryOptions): Promise<TemporalLedgerEntry[]>
}
