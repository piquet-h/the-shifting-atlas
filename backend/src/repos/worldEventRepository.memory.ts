/**
 * In-memory implementation of IWorldEventRepository for testing.
 * Simulates SQL API query patterns for unit/integration tests.
 */

import type {
    IWorldEventRepository,
    TimelineQueryOptions,
    TimelineQueryResult,
    WorldEventRecord
} from '@piquet-h/shared/types/worldEventRepository'
import { injectable } from 'inversify'

@injectable()
export class MemoryWorldEventRepository implements IWorldEventRepository {
    private events: Map<string, WorldEventRecord> = new Map()

    async create(event: WorldEventRecord): Promise<WorldEventRecord> {
        // Store with composite key: scopeKey:eventId
        const key = `${event.scopeKey}:${event.id}`

        // Upsert behavior - create or replace
        this.events.set(key, { ...event })
        return { ...event }
    }

    async updateStatus(
        eventId: string,
        scopeKey: string,
        updates: Pick<WorldEventRecord, 'status'> & Partial<Pick<WorldEventRecord, 'processedUtc' | 'processingMetadata'>>
    ): Promise<WorldEventRecord | null> {
        const key = `${scopeKey}:${eventId}`
        const existing = this.events.get(key)

        if (!existing) {
            return null
        }

        const updated: WorldEventRecord = {
            ...existing,
            status: updates.status,
            processedUtc: updates.processedUtc || existing.processedUtc,
            processingMetadata: updates.processingMetadata || existing.processingMetadata
        }

        this.events.set(key, updated)
        return { ...updated }
    }

    async getById(eventId: string, scopeKey: string): Promise<WorldEventRecord | null> {
        const key = `${scopeKey}:${eventId}`
        const event = this.events.get(key)
        return event ? { ...event } : null
    }

    async queryByScope(scopeKey: string, options?: TimelineQueryOptions): Promise<TimelineQueryResult> {
        const startTime = Date.now()

        // Filter events by scopeKey
        let filtered = Array.from(this.events.values()).filter((e) => e.scopeKey === scopeKey)

        // Apply status filter
        if (options?.status) {
            filtered = filtered.filter((e) => e.status === options.status)
        }

        // Apply timestamp filters
        if (options?.afterTimestamp) {
            filtered = filtered.filter((e) => e.occurredUtc > options.afterTimestamp!)
        }

        if (options?.beforeTimestamp) {
            filtered = filtered.filter((e) => e.occurredUtc < options.beforeTimestamp!)
        }

        // Sort by occurredUtc
        const order = options?.order || 'desc'
        filtered.sort((a, b) => {
            const comparison = a.occurredUtc.localeCompare(b.occurredUtc)
            return order === 'desc' ? -comparison : comparison
        })

        // Apply limit
        const limit = options?.limit || 100
        const hasMore = filtered.length > limit
        const events = filtered.slice(0, limit)

        const latencyMs = Date.now() - startTime

        return {
            events,
            ruCharge: 5.0, // Simulated RU cost
            latencyMs,
            hasMore
        }
    }

    async getRecent(limit: number = 100): Promise<WorldEventRecord[]> {
        // Get all events, sort by occurredUtc desc, take limit
        const allEvents = Array.from(this.events.values())
        allEvents.sort((a, b) => b.occurredUtc.localeCompare(a.occurredUtc))
        return allEvents.slice(0, limit)
    }

    async getByIdempotencyKey(idempotencyKey: string): Promise<WorldEventRecord | null> {
        // Linear scan for idempotency key
        for (const event of this.events.values()) {
            if (event.idempotencyKey === idempotencyKey) {
                return { ...event }
            }
        }
        return null
    }

    // Test utility: clear all events
    clear(): void {
        this.events.clear()
    }

    // Test utility: get event count
    count(): number {
        return this.events.size
    }
}
