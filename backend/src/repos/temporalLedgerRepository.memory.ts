/**
 * In-memory implementation of Temporal Ledger Repository for testing
 */

import type { TemporalLedgerEntry } from '@piquet-h/shared'
import { buildPlayerScopeKey, buildWcScopeKey } from '@piquet-h/shared'
import { injectable } from 'inversify'
import type { ITemporalLedgerRepository, TimeRangeQueryOptions } from './temporalLedgerRepository.js'

/**
 * In-memory temporal ledger repository for testing
 */
@injectable()
export class TemporalLedgerRepositoryMemory implements ITemporalLedgerRepository {
    private entries: Map<string, TemporalLedgerEntry> = new Map()

    /**
     * Log a temporal event (idempotent)
     */
    async log(entry: TemporalLedgerEntry): Promise<TemporalLedgerEntry> {
        // Upsert semantics - last write wins
        this.entries.set(entry.id, { ...entry })
        return { ...entry }
    }

    /**
     * Query events for a specific player
     */
    async queryByPlayer(playerId: string, maxResults: number = 100): Promise<TemporalLedgerEntry[]> {
        const scopeKey = buildPlayerScopeKey(playerId)
        return this.queryByScopeKey(scopeKey, maxResults)
    }

    /**
     * Query world clock advancement events
     */
    async queryByWorldClock(maxResults: number = 100): Promise<TemporalLedgerEntry[]> {
        const scopeKey = buildWcScopeKey()
        return this.queryByScopeKey(scopeKey, maxResults)
    }

    /**
     * Query events within a specific time range
     */
    async queryByTimeRange(options: TimeRangeQueryOptions): Promise<TemporalLedgerEntry[]> {
        const { startTimestamp, endTimestamp, maxResults = 100 } = options
        const start = new Date(startTimestamp)
        const end = new Date(endTimestamp)

        const results = Array.from(this.entries.values())
            .filter((entry) => {
                const entryTime = new Date(entry.timestamp)
                return entryTime >= start && entryTime <= end
            })
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, maxResults)

        return results
    }

    /**
     * Query by scope key (helper)
     */
    private queryByScopeKey(scopeKey: string, maxResults: number): TemporalLedgerEntry[] {
        const results = Array.from(this.entries.values())
            .filter((entry) => entry.scopeKey === scopeKey)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, maxResults)

        return results
    }

    /**
     * Clear all entries (for testing)
     */
    async clear(): Promise<void> {
        this.entries.clear()
    }
}
