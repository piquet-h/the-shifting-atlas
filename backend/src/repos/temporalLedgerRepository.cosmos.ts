/**
 * Cosmos SQL API implementation of Temporal Ledger Repository
 *
 * Provides durable audit trail for temporal events with efficient partition isolation.
 * Container: `temporalLedger` (PK: `/scopeKey`)
 * TTL: Configurable via TEMPORAL_LEDGER_TTL_DAYS environment variable
 */

import type { TemporalLedgerEntry } from '@piquet-h/shared'
import { buildPlayerScopeKey, buildWcScopeKey } from '@piquet-h/shared'
import { inject, injectable } from 'inversify'
import { TelemetryService } from '../telemetry/TelemetryService.js'
import { CosmosDbSqlRepository } from './base/CosmosDbSqlRepository.js'
import type { ICosmosDbSqlClient } from './base/cosmosDbSqlClient.js'
import type { ITemporalLedgerRepository, TimeRangeQueryOptions } from './temporalLedgerRepository.js'

/**
 * Cosmos SQL API implementation of temporal ledger repository
 */
@injectable()
export class TemporalLedgerRepositoryCosmos extends CosmosDbSqlRepository<TemporalLedgerEntry> implements ITemporalLedgerRepository {
    constructor(
        @inject('CosmosDbSqlClient') sqlClient: ICosmosDbSqlClient,
        @inject(TelemetryService) protected telemetryService: TelemetryService
    ) {
        super(sqlClient, 'temporalLedger', telemetryService)
    }

    /**
     * Log a temporal event (idempotent via upsert)
     */
    async log(entry: TemporalLedgerEntry): Promise<TemporalLedgerEntry> {
        const { resource } = await this.upsert(entry)
        return resource
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

        // Use parameterized query to prevent injection and leverage Cosmos SQL query optimizer
        const queryText = `
            SELECT * FROM c 
            WHERE c.timestamp >= @startTimestamp 
                AND c.timestamp <= @endTimestamp 
            ORDER BY c.timestamp DESC
        `

        const parameters = [
            { name: '@startTimestamp', value: startTimestamp },
            { name: '@endTimestamp', value: endTimestamp }
        ]

        const { items } = await this.query(queryText, parameters, maxResults)
        return items
    }

    /**
     * Query by scope key (helper for player and world clock queries)
     * Efficient single-partition query
     */
    private async queryByScopeKey(scopeKey: string, maxResults: number): Promise<TemporalLedgerEntry[]> {
        const queryText = `
            SELECT * FROM c 
            WHERE c.scopeKey = @scopeKey 
            ORDER BY c.timestamp DESC
        `

        const parameters = [{ name: '@scopeKey', value: scopeKey }]

        const { items } = await this.query(queryText, parameters, maxResults)
        return items
    }
}
