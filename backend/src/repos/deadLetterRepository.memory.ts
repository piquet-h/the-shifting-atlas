/**
 * In-Memory Dead-Letter Repository Implementation
 *
 * Memory-backed implementation for testing and local development.
 */

import type { DeadLetterRecord } from '@piquet-h/shared/deadLetter'
import { injectable } from 'inversify'
import { BaseMemoryRepository } from './base/BaseMemoryRepository.js'
import type { IDeadLetterRepository } from './deadLetterRepository.js'

/**
 * In-memory implementation of dead-letter repository
 */
@injectable()
export class MemoryDeadLetterRepository extends BaseMemoryRepository<string, DeadLetterRecord> implements IDeadLetterRepository {
    /**
     * Store a dead-letter record in memory
     */
    async store(record: DeadLetterRecord): Promise<void> {
        this.records.set(record.id, record)
    }

    /**
     * Query dead-letter records by time range
     */
    async queryByTimeRange(startUtc: string, endUtc: string, maxResults: number = 100): Promise<DeadLetterRecord[]> {
        const start = new Date(startUtc).getTime()
        const end = new Date(endUtc).getTime()

        const filtered = Array.from(this.records.values())
            .filter((r) => {
                const timestamp = new Date(r.deadLetteredUtc).getTime()
                return timestamp >= start && timestamp <= end
            })
            .sort((a, b) => new Date(b.deadLetteredUtc).getTime() - new Date(a.deadLetteredUtc).getTime())
            .slice(0, maxResults)

        return filtered
    }

    /**
     * Get a single dead-letter record by ID
     */
    async getById(id: string): Promise<DeadLetterRecord | null> {
        return this.records.get(id) || null
    }

    /**
     * Get all records (for testing)
     */
    getAll(): DeadLetterRecord[] {
        return Array.from(this.records.values())
    }
}
