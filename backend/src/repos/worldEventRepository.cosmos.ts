/**
 * Cosmos SQL API implementation of IWorldEventRepository.
 * Uses partition key /scopeKey for efficient timeline queries per scope.
 *
 * Container: worldEvents
 * Partition Key: /scopeKey
 * Goal: Timeline queries complete in ≤200ms for 1000-event scope
 */

import type { SqlParameter } from '@azure/cosmos'
import type {
    IWorldEventRepository,
    TimelineQueryOptions,
    TimelineQueryResult,
    WorldEventRecord
} from '@piquet-h/shared/types/worldEventRepository'
import { inject, injectable } from 'inversify'
import { TelemetryService } from '../telemetry/TelemetryService.js'
import { CosmosDbSqlRepository } from './base/CosmosDbSqlRepository.js'
import type { ICosmosDbSqlClient } from './base/cosmosDbSqlClient.js'

/**
 * SQL API document schema for world events (matches WorldEventRecord interface)
 */
interface WorldEventDocument extends WorldEventRecord {
    id: string
    scopeKey: string
}

/**
 * Internal helper that extends base repository for protected method access.
 * Similar pattern to how Gremlin repositories wrap the client.
 */
class WorldEventSqlHelper extends CosmosDbSqlRepository<WorldEventDocument> {
    constructor(sqlClient: ICosmosDbSqlClient, telemetryService?: TelemetryService) {
        super(sqlClient, 'worldEvents', telemetryService)
    }

    // Expose upsert for public use (avoids conflict with protected create)
    public async upsertEvent(doc: WorldEventDocument): Promise<{ resource: WorldEventDocument; ruCharge: number }> {
        return this.upsert(doc)
    }

    public async getEvent(id: string, scopeKey: string): Promise<WorldEventDocument | null> {
        return this.getById(id, scopeKey)
    }

    public async queryEvents(
        query: string,
        parameters: SqlParameter[],
        maxResults?: number
    ): Promise<{ items: WorldEventDocument[]; ruCharge: number }> {
        return this.query(query, parameters, maxResults)
    }
}

@injectable()
export class CosmosWorldEventRepository implements IWorldEventRepository {
    private sql: WorldEventSqlHelper

    constructor(
        @inject('CosmosDbSqlClient') sqlClient: ICosmosDbSqlClient,
        @inject(TelemetryService) private telemetryService: TelemetryService
    ) {
        this.sql = new WorldEventSqlHelper(sqlClient, telemetryService)
    }

    async create(event: WorldEventRecord): Promise<WorldEventRecord> {
        const startTime = Date.now()

        const doc: WorldEventDocument = {
            ...event,
            id: event.id,
            scopeKey: event.scopeKey
        }

        const result = await this.sql.upsertEvent(doc)

        this.telemetryService.trackGameEvent('WorldEvent.Create', {
            eventId: event.id,
            scopeKey: event.scopeKey,
            eventType: event.eventType,
            ruCharge: result.ruCharge,
            latencyMs: Date.now() - startTime
        })

        return result.resource
    }

    async updateStatus(
        eventId: string,
        scopeKey: string,
        updates: Pick<WorldEventRecord, 'status'> & Partial<Pick<WorldEventRecord, 'processedUtc' | 'processingMetadata'>>
    ): Promise<WorldEventRecord | null> {
        const startTime = Date.now()

        const existing = await this.sql.getEvent(eventId, scopeKey)
        if (!existing) {
            this.telemetryService.trackGameEvent('WorldEvent.UpdateStatus', {
                eventId,
                scopeKey,
                status: updates.status,
                found: false,
                latencyMs: Date.now() - startTime
            })
            return null
        }

        const updated: WorldEventDocument = {
            ...existing,
            status: updates.status,
            processedUtc: updates.processedUtc || existing.processedUtc,
            processingMetadata: updates.processingMetadata || existing.processingMetadata
        }

        const result = await this.sql.upsertEvent(updated)

        this.telemetryService.trackGameEvent('WorldEvent.UpdateStatus', {
            eventId,
            scopeKey,
            status: updates.status,
            found: true,
            ruCharge: result.ruCharge,
            latencyMs: Date.now() - startTime
        })

        return result.resource
    }

    async getById(eventId: string, scopeKey: string): Promise<WorldEventRecord | null> {
        const startTime = Date.now()

        const event = await this.sql.getEvent(eventId, scopeKey)

        this.telemetryService.trackGameEvent('WorldEvent.GetById', {
            eventId,
            scopeKey,
            found: !!event,
            latencyMs: Date.now() - startTime
        })

        return event
    }

    async queryByScope(scopeKey: string, options?: TimelineQueryOptions): Promise<TimelineQueryResult> {
        const startTime = Date.now()

        const limit = options?.limit || 100
        const order = options?.order || 'desc'

        let queryText = 'SELECT * FROM c WHERE c.scopeKey = @scopeKey'
        const parameters: SqlParameter[] = [{ name: '@scopeKey', value: scopeKey }]

        if (options?.status) {
            queryText += ' AND c.status = @status'
            parameters.push({ name: '@status', value: options.status })
        }

        if (options?.afterTimestamp) {
            queryText += ' AND c.occurredUtc > @afterTimestamp'
            parameters.push({ name: '@afterTimestamp', value: options.afterTimestamp })
        }

        if (options?.beforeTimestamp) {
            queryText += ' AND c.occurredUtc < @beforeTimestamp'
            parameters.push({ name: '@beforeTimestamp', value: options.beforeTimestamp })
        }

        queryText += ` ORDER BY c.occurredUtc ${order.toUpperCase()}`

        const { items, ruCharge } = await this.sql.queryEvents(queryText, parameters, limit + 1)

        const hasMore = items.length > limit
        const events = hasMore ? items.slice(0, limit) : items

        const totalLatencyMs = Date.now() - startTime

        this.telemetryService.trackGameEvent('WorldEvent.QueryByScope', {
            scopeKey,
            resultCount: events.length,
            hasMore,
            ruCharge,
            latencyMs: totalLatencyMs
        })

        return {
            events,
            ruCharge,
            latencyMs: totalLatencyMs,
            hasMore
        }
    }

    async getRecent(limit: number = 100): Promise<WorldEventRecord[]> {
        const startTime = Date.now()

        const queryText = 'SELECT * FROM c ORDER BY c.occurredUtc DESC'
        const { items, ruCharge } = await this.sql.queryEvents(queryText, [], limit)

        this.telemetryService.trackGameEvent('WorldEvent.GetRecent', {
            resultCount: items.length,
            ruCharge,
            latencyMs: Date.now() - startTime,
            crossPartition: true
        })

        return items
    }

    async getByIdempotencyKey(idempotencyKey: string): Promise<WorldEventRecord | null> {
        const startTime = Date.now()

        const queryText = 'SELECT * FROM c WHERE c.idempotencyKey = @idempotencyKey'
        const parameters: SqlParameter[] = [{ name: '@idempotencyKey', value: idempotencyKey }]

        const { items, ruCharge } = await this.sql.queryEvents(queryText, parameters, 1)

        this.telemetryService.trackGameEvent('WorldEvent.GetByIdempotencyKey', {
            idempotencyKey,
            found: items.length > 0,
            ruCharge,
            latencyMs: Date.now() - startTime,
            crossPartition: true
        })

        return items.length > 0 ? items[0] : null
    }
}
