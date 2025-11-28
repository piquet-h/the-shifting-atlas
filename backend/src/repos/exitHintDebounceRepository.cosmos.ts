/**
 * Cosmos SQL API implementation of Exit Hint Debounce Repository
 *
 * Provides durable debounce tracking with automatic TTL expiration.
 * Uses upsert pattern for atomic check-and-record operations.
 *
 * Partition Key: /scopeKey (pattern: player:<playerId>)
 * TTL: Configurable via EXIT_HINT_DEBOUNCE_MS + buffer
 */

import type { Direction } from '@piquet-h/shared'
import type {
    DebounceCheckResult,
    ExitHintDebounceRecord,
    IExitHintDebounceRepository
} from '@piquet-h/shared/types/exitHintDebounceRepository'
import { buildDebounceKey, buildScopeKey } from '@piquet-h/shared/types/exitHintDebounceRepository'
import { inject, injectable } from 'inversify'
import { v4 as uuid } from 'uuid'
import { CosmosDbSqlRepository } from './base/CosmosDbSqlRepository.js'
import type { ICosmosDbSqlClient } from './base/cosmosDbSqlClient.js'

@injectable()
export class CosmosExitHintDebounceRepository extends CosmosDbSqlRepository<ExitHintDebounceRecord> implements IExitHintDebounceRepository {
    private debounceWindowMs: number
    private ttlSeconds: number

    constructor(
        @inject('CosmosDbSqlClient') client: ICosmosDbSqlClient,
        @inject('CosmosContainer:ExitHintDebounce') containerName: string,
        @inject('ExitHintDebounceWindowMs') debounceWindowMs: number
    ) {
        super(client, containerName)
        this.debounceWindowMs = debounceWindowMs
        // TTL is debounce window + 60 second buffer for cleanup
        this.ttlSeconds = Math.ceil(debounceWindowMs / 1000) + 60
    }

    /**
     * Check if a hint should be emitted and record the attempt.
     *
     * Uses a read-then-upsert pattern:
     * 1. Query for existing debounce record by debounceKey within partition
     * 2. If found and within window, return debounceHit=true
     * 3. If not found or expired, upsert new record and return emit=true
     */
    async shouldEmit(playerId: string, originLocationId: string, dir: Direction): Promise<DebounceCheckResult> {
        const now = Date.now()
        const nowIso = new Date(now).toISOString()
        const debounceKey = buildDebounceKey(playerId, originLocationId, dir)
        const scopeKey = buildScopeKey(playerId)

        try {
            // Query for existing record within the player's partition
            const querySpec = {
                query: 'SELECT * FROM c WHERE c.debounceKey = @debounceKey',
                parameters: [
                    {
                        name: '@debounceKey',
                        value: debounceKey
                    }
                ]
            }

            const { resources } = await this.container.items
                .query(querySpec, {
                    partitionKey: scopeKey,
                    maxItemCount: 1
                })
                .fetchAll()

            const existing = resources.length > 0 ? (resources[0] as ExitHintDebounceRecord) : null

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

            // Not debounced - upsert new record and allow emit
            const record: ExitHintDebounceRecord = {
                id: existing?.id ?? uuid(), // Reuse ID if updating existing record
                scopeKey,
                debounceKey,
                playerId,
                originLocationId,
                direction: dir,
                lastEmitUtc: nowIso,
                ttl: this.ttlSeconds
            }

            await this.container.items.upsert(record)

            return {
                emit: true,
                debounceHit: false
            }
        } catch (error) {
            // On error, default to allowing emit (availability over strict debounce)
            // This matches the "proceed on failure" pattern from processedEventRepository
            const cosmosError = error as { code?: number }
            if (cosmosError.code === 404) {
                // Container doesn't exist - proceed with emit
                return {
                    emit: true,
                    debounceHit: false
                }
            }
            // Log unexpected errors for debugging before re-throwing
            console.warn('[ExitHintDebounceRepository] Unexpected error during shouldEmit:', error)
            throw error
        }
    }

    /**
     * Clear all debounce entries. Primarily for testing.
     * In production, entries expire via TTL.
     *
     * Note: This is a no-op in Cosmos since clearing a container is expensive.
     * Use TTL expiration for cleanup in production.
     */
    clear(): void {
        // No-op in Cosmos SQL implementation
        // Entries expire via TTL automatically
    }
}
