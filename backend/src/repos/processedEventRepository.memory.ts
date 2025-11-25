/**
 * In-memory implementation of Processed Event Repository
 *
 * For local development and testing.
 * Does not persist across restarts (matches original in-memory cache behavior).
 */

import type { IProcessedEventRepository, ProcessedEventRecord } from '@piquet-h/shared/types/processedEventRepository'
import { injectable } from 'inversify'
import { BaseMemoryRepository } from './base/BaseMemoryRepository.js'

@injectable()
export class MemoryProcessedEventRepository
    extends BaseMemoryRepository<string, ProcessedEventRecord>
    implements IProcessedEventRepository
{
    private ttlMs: number

    constructor(ttlSeconds: number = 604800) {
        // Default TTL: 7 days = 604800 seconds
        super()
        this.ttlMs = ttlSeconds * 1000
    }

    async markProcessed(record: ProcessedEventRecord): Promise<ProcessedEventRecord> {
        // Store with TTL
        const recordWithTtl = {
            ...record,
            ttl: Math.floor(this.ttlMs / 1000)
        }
        this.records.set(record.idempotencyKey, recordWithTtl)

        // Schedule automatic cleanup after TTL (inherited from BaseMemoryRepository)
        this.scheduleCleanup(record.idempotencyKey, this.ttlMs)

        return recordWithTtl
    }

    async checkProcessed(idempotencyKey: string): Promise<ProcessedEventRecord | null> {
        const record = this.records.get(idempotencyKey)
        if (!record) {
            return null
        }

        // Check if TTL expired (extra safety, though setTimeout should handle it)
        const age = Date.now() - new Date(record.processedUtc).getTime()
        if (age > this.ttlMs) {
            this.records.delete(idempotencyKey)
            return null
        }

        return record
    }

    async getById(id: string, idempotencyKey: string): Promise<ProcessedEventRecord | null> {
        // In memory implementation: search by idempotencyKey
        const record = this.records.get(idempotencyKey)
        if (record && record.id === id) {
            return record
        }
        return null
    }
}
