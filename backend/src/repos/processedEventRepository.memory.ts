/**
 * In-memory implementation of Processed Event Repository
 *
 * For local development and testing.
 * Does not persist across restarts (matches original in-memory cache behavior).
 */

import type { IProcessedEventRepository, ProcessedEventRecord } from '@piquet-h/shared/types/processedEventRepository'
import { injectable } from 'inversify'

@injectable()
export class MemoryProcessedEventRepository implements IProcessedEventRepository {
    private store: Map<string, ProcessedEventRecord>
    private ttlMs: number
    private timers: Map<string, NodeJS.Timeout>

    constructor(ttlSeconds: number = 604800) {
        // Default TTL: 7 days = 604800 seconds
        this.store = new Map()
        this.ttlMs = ttlSeconds * 1000
        this.timers = new Map()
    }

    async markProcessed(record: ProcessedEventRecord): Promise<ProcessedEventRecord> {
        // Store with TTL
        const recordWithTtl = {
            ...record,
            ttl: Math.floor(this.ttlMs / 1000)
        }
        this.store.set(record.idempotencyKey, recordWithTtl)

        // Clear any existing timer for this key
        const existingTimer = this.timers.get(record.idempotencyKey)
        if (existingTimer) {
            clearTimeout(existingTimer)
        }

        // Schedule automatic cleanup after TTL
        // Use unref() so timer doesn't keep event loop alive
        const timer = setTimeout(() => {
            this.store.delete(record.idempotencyKey)
            this.timers.delete(record.idempotencyKey)
        }, this.ttlMs)
        timer.unref()
        this.timers.set(record.idempotencyKey, timer)

        return recordWithTtl
    }

    async checkProcessed(idempotencyKey: string): Promise<ProcessedEventRecord | null> {
        const record = this.store.get(idempotencyKey)
        if (!record) {
            return null
        }

        // Check if TTL expired (extra safety, though setTimeout should handle it)
        const age = Date.now() - new Date(record.processedUtc).getTime()
        if (age > this.ttlMs) {
            this.store.delete(idempotencyKey)
            return null
        }

        return record
    }

    async getById(id: string, idempotencyKey: string): Promise<ProcessedEventRecord | null> {
        // In memory implementation: search by idempotencyKey
        const record = this.store.get(idempotencyKey)
        if (record && record.id === id) {
            return record
        }
        return null
    }

    /**
     * Clear all processed events (for testing)
     */
    clear(): void {
        // Clear all timers
        for (const timer of this.timers.values()) {
            clearTimeout(timer)
        }
        this.timers.clear()
        this.store.clear()
    }

    /**
     * Get current size (for testing/monitoring)
     */
    size(): number {
        return this.store.size
    }
}
