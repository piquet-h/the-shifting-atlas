/**
 * Dead-Letter Repository Interface
 *
 * Provides persistence for failed world events with redacted payloads.
 * Used by queue processors to store validation failures for debugging.
 */

import type { DeadLetterRecord } from '@piquet-h/shared/deadLetter'

/**
 * Repository interface for dead-letter storage
 */
export interface IDeadLetterRepository {
    /**
     * Store a dead-letter record
     *
     * @param record - Dead-letter record to store
     * @returns Promise that resolves when storage completes, or rejects on error
     */
    store(record: DeadLetterRecord): Promise<void>

    /**
     * Query dead-letter records by time range
     *
     * @param startUtc - Start of time range (ISO 8601)
     * @param endUtc - End of time range (ISO 8601)
     * @param maxResults - Maximum number of results to return (default: 100)
     * @returns Promise with array of dead-letter records
     */
    queryByTimeRange(startUtc: string, endUtc: string, maxResults?: number): Promise<DeadLetterRecord[]>

    /**
     * Get a single dead-letter record by ID
     *
     * @param id - Dead-letter record ID
     * @returns Promise with record, or null if not found
     */
    getById(id: string): Promise<DeadLetterRecord | null>
}
