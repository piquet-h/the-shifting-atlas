/**
 * World Clock Service Implementation
 *
 * Manages global world time progression with immutable advancement history.
 * Provides authoritative time source for all world events and player clock reconciliation.
 */

import { inject, injectable } from 'inversify'
import type { IWorldClockRepository } from '../repos/worldClockRepository.js'
import { TelemetryService } from '../telemetry/TelemetryService.js'
import type { IWorldClockService } from './types.js'

@injectable()
export class WorldClockService implements IWorldClockService {
    constructor(
        @inject('IWorldClockRepository') private readonly repository: IWorldClockRepository,
        @inject(TelemetryService) private readonly telemetry: TelemetryService
    ) {}

    /**
     * Get the current world clock tick
     */
    async getCurrentTick(): Promise<number> {
        const clock = await this.repository.get()

        // Auto-initialize if not exists
        if (!clock) {
            const initialized = await this.repository.initialize(0)
            return initialized.currentTick
        }

        return clock.currentTick
    }

    /**
     * Advance the world clock by duration
     */
    async advanceTick(durationMs: number, reason: string): Promise<number> {
        if (durationMs <= 0) {
            throw new Error('Duration must be positive')
        }

        // Get current clock state
        let clock = await this.repository.get()

        // Auto-initialize if not exists
        if (!clock) {
            clock = await this.repository.initialize(0)
        }

        // Advance with optimistic concurrency control
        const updated = await this.repository.advance(durationMs, reason, clock._etag!)

        // Emit telemetry event
        this.telemetry.trackGameEvent('World.Clock.Advanced', {
            durationMs,
            newTick: updated.currentTick,
            reason
        })

        return updated.currentTick
    }

    /**
     * Query world clock tick at specific timestamp (historical query)
     */
    async getTickAt(timestamp: Date): Promise<number | null> {
        const clock = await this.repository.get()

        if (!clock) {
            return null
        }

        // Check if timestamp is before clock initialization
        const initTime = new Date(clock.lastAdvanced)
        if (timestamp < initTime && clock.advancementHistory.length === 0) {
            // Timestamp is before the clock was initialized
            return null
        }

        // If no advancements yet, clock is at initial state (0)
        if (clock.advancementHistory.length === 0) {
            return 0
        }

        // Find the last advancement before or at the timestamp
        let tickAtTime = 0 // Start from initialization

        for (const advancement of clock.advancementHistory) {
            const advancementTime = new Date(advancement.timestamp)

            if (advancementTime <= timestamp) {
                tickAtTime = advancement.tickAfter
            } else {
                // We've passed the query timestamp
                break
            }
        }

        // If timestamp is before the first advancement, return 0 (initialized state)
        const firstAdvancement = new Date(clock.advancementHistory[0].timestamp)
        if (timestamp < firstAdvancement) {
            // Check if timestamp is after initialization
            if (timestamp >= initTime) {
                return 0
            }
            return null
        }

        return tickAtTime
    }
}
