/**
 * In-memory implementation of Exit Hint Debounce Repository
 *
 * For local development and testing.
 * Uses TTL-based expiration with automatic cleanup.
 *
 * Thread-safety: This implementation is NOT thread-safe.
 * In Node.js single-threaded context, this is acceptable.
 */

import type { Direction } from '@piquet-h/shared'
import type {
    DebounceCheckResult,
    ExitHintDebounceRecord,
    IExitHintDebounceRepository
} from '@piquet-h/shared/types/exitHintDebounceRepository'
import { buildDebounceKey, buildScopeKey } from '@piquet-h/shared/types/exitHintDebounceRepository'
import { injectable } from 'inversify'
import { v4 as uuid } from 'uuid'
import { BaseMemoryRepository } from './base/BaseMemoryRepository.js'

@injectable()
export class MemoryExitHintDebounceRepository
    extends BaseMemoryRepository<string, ExitHintDebounceRecord>
    implements IExitHintDebounceRepository
{
    private debounceWindowMs: number

    constructor(debounceWindowMs: number = 60_000) {
        super()
        this.debounceWindowMs = debounceWindowMs
    }

    async shouldEmit(playerId: string, originLocationId: string, dir: Direction): Promise<DebounceCheckResult> {
        const now = Date.now()
        const debounceKey = buildDebounceKey(playerId, originLocationId, dir)
        const existing = this.records.get(debounceKey)

        // Check if within debounce window
        if (existing) {
            const lastEmitTime = new Date(existing.lastEmitUtc).getTime()
            const elapsed = now - lastEmitTime
            if (elapsed < this.debounceWindowMs) {
                // Debounce hit - don't emit
                return {
                    emit: false,
                    debounceHit: true
                }
            }
        }

        // Not debounced - record and allow emit
        const record: ExitHintDebounceRecord = {
            id: uuid(),
            scopeKey: buildScopeKey(playerId),
            debounceKey,
            playerId,
            originLocationId,
            direction: dir,
            lastEmitUtc: new Date(now).toISOString(),
            ttl: Math.floor(this.debounceWindowMs / 1000) + 60 // Buffer for cleanup
        }

        this.records.set(debounceKey, record)

        // Schedule automatic cleanup after TTL
        this.scheduleCleanup(debounceKey, this.debounceWindowMs + 60_000)

        return {
            emit: true,
            debounceHit: false
        }
    }
}
