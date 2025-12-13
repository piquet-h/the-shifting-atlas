/**
 * Cosmos SQL API implementation of World Clock Repository
 *
 * Singleton document storage with optimistic concurrency control (ETag).
 * Container: `worldClock` (PK: `/id`)
 */

import type { WorldClock } from '@piquet-h/shared'
import { buildWorldClockId } from '@piquet-h/shared'
import { inject, injectable } from 'inversify'
import { TelemetryService } from '../telemetry/TelemetryService.js'
import { CosmosDbSqlRepository } from './base/CosmosDbSqlRepository.js'
import type { ICosmosDbSqlClient } from './base/cosmosDbSqlClient.js'
import { ConcurrentAdvancementError, type IWorldClockRepository } from './worldClockRepository.js'

/**
 * Cosmos SQL API implementation of world clock repository
 */
@injectable()
export class WorldClockRepositoryCosmos extends CosmosDbSqlRepository<WorldClock> implements IWorldClockRepository {
    constructor(
        @inject('CosmosDbSqlClient') sqlClient: ICosmosDbSqlClient,
        @inject('CosmosContainer:WorldClock') containerName: string,
        @inject(TelemetryService) protected telemetryService: TelemetryService
    ) {
        super(sqlClient, containerName, telemetryService)
    }

    /**
     * Get the current world clock state
     */
    async get(): Promise<WorldClock | null> {
        const clockId = buildWorldClockId()
        return await this.getById(clockId, clockId)
    }

    /**
     * Initialize the world clock with starting tick
     */
    async initialize(initialTick: number = 0): Promise<WorldClock> {
        const clockId = buildWorldClockId()

        // Check if already exists
        const existing = await this.get()
        if (existing) {
            throw new Error('World clock already initialized')
        }

        const clock: WorldClock = {
            id: clockId,
            currentTick: initialTick,
            lastAdvanced: new Date().toISOString(),
            advancementHistory: []
        }

        const { resource } = await this.upsert(clock)
        return resource
    }

    /**
     * Advance the world clock by duration with optimistic concurrency control
     */
    async advance(durationMs: number, reason: string, currentEtag: string): Promise<WorldClock> {
        if (durationMs <= 0) {
            throw new Error('Duration must be positive')
        }

        const clockId = buildWorldClockId()

        // Read current state to verify ETag
        const current = await this.get()
        if (!current) {
            throw new Error('World clock not initialized')
        }

        // Check ETag for optimistic concurrency
        if (current._etag !== currentEtag) {
            throw new ConcurrentAdvancementError('ETag mismatch: concurrent modification detected')
        }

        const now = new Date().toISOString()
        const newTick = current.currentTick + durationMs

        // Create advancement log entry
        const logEntry = {
            timestamp: now,
            durationMs,
            reason,
            tickAfter: newTick
        }

        // Update clock (immutable history append)
        const updated: WorldClock = {
            ...current,
            currentTick: newTick,
            lastAdvanced: now,
            advancementHistory: [...current.advancementHistory, logEntry]
        }

        try {
            // Use Cosmos replace with ETag condition
            const { resource } = await this.replace(clockId, updated, clockId, currentEtag)
            return resource
        } catch (error) {
            // 412 Precondition Failed means ETag mismatch (concurrent modification)
            if (error && typeof error === 'object' && 'code' in error && error.code === 412) {
                throw new ConcurrentAdvancementError('Concurrent modification detected (ETag mismatch)')
            }
            throw error
        }
    }
}
