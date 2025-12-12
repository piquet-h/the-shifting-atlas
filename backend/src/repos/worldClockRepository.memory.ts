/**
 * In-memory implementation of World Clock Repository
 * For testing and local development
 */

import type { WorldClock } from '@piquet-h/shared'
import { buildWorldClockId } from '@piquet-h/shared'
import { injectable } from 'inversify'
import { ConcurrentAdvancementError, type IWorldClockRepository } from './worldClockRepository.js'

/**
 * In-memory world clock repository
 */
@injectable()
export class WorldClockRepositoryMemory implements IWorldClockRepository {
    private clock: WorldClock | null = null

    /**
     * Get the current world clock state
     */
    async get(): Promise<WorldClock | null> {
        return this.clock ? { ...this.clock } : null
    }

    /**
     * Initialize the world clock with starting tick
     */
    async initialize(initialTick: number = 0): Promise<WorldClock> {
        if (this.clock) {
            throw new Error('World clock already initialized')
        }

        this.clock = {
            id: buildWorldClockId(),
            currentTick: initialTick,
            lastAdvanced: new Date().toISOString(),
            advancementHistory: [],
            _etag: this.generateEtag()
        }

        return { ...this.clock }
    }

    /**
     * Advance the world clock by duration with optimistic concurrency control
     */
    async advance(durationMs: number, reason: string, currentEtag: string): Promise<WorldClock> {
        if (!this.clock) {
            throw new Error('World clock not initialized')
        }

        if (durationMs <= 0) {
            throw new Error('Duration must be positive')
        }

        // Check ETag for optimistic concurrency
        if (this.clock._etag !== currentEtag) {
            throw new ConcurrentAdvancementError('ETag mismatch: concurrent modification detected')
        }

        const now = new Date().toISOString()
        const newTick = this.clock.currentTick + durationMs

        // Create advancement log entry
        const logEntry = {
            timestamp: now,
            durationMs,
            reason,
            tickAfter: newTick
        }

        // Update clock (immutable history append)
        this.clock = {
            ...this.clock,
            currentTick: newTick,
            lastAdvanced: now,
            advancementHistory: [...this.clock.advancementHistory, logEntry],
            _etag: this.generateEtag()
        }

        return { ...this.clock }
    }

    /**
     * Generate a mock ETag for concurrency testing
     */
    private generateEtag(): string {
        return `"${Date.now()}-${Math.random().toString(36).substr(2, 9)}"`
    }

    /**
     * Clear clock state (for testing)
     */
    clear(): void {
        this.clock = null
    }
}
