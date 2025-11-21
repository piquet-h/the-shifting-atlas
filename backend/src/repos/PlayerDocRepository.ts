/**
 * PlayerDocRepository - SQL API repository for PlayerDoc projection
 *
 * Implements core CRUD operations for player documents in Cosmos SQL API.
 * Per ADR-002, provides cost-efficient mutable player state storage with
 * optimal partition isolation (one player = one partition).
 *
 * Container: `players` (PK: `/id`)
 */

import type { PlayerDoc } from '@piquet-h/shared'
import { inject, injectable } from 'inversify'
import { TelemetryService } from '../telemetry/TelemetryService.js'
import { CosmosDbSqlRepository } from './base/CosmosDbSqlRepository.js'
import type { ICosmosDbSqlClient } from './base/cosmosDbSqlClient.js'

/**
 * Repository interface for PlayerDoc operations
 */
export interface IPlayerDocRepository {
    /**
     * Get player by ID
     * @param playerId - Player unique identifier
     * @returns PlayerDoc or null if not found
     */
    getPlayer(playerId: string): Promise<PlayerDoc | null>

    /**
     * Upsert player document (idempotent create or update)
     * @param playerDoc - Player document to upsert
     */
    upsertPlayer(playerDoc: PlayerDoc): Promise<void>

    /**
     * Delete player document by ID (idempotent)
     * @param playerId - Player unique identifier
     * @returns true if deleted, false if not found
     */
    deletePlayer(playerId: string): Promise<boolean>
}

/**
 * Cosmos SQL API implementation of PlayerDoc repository
 */
@injectable()
export class PlayerDocRepository extends CosmosDbSqlRepository<PlayerDoc> implements IPlayerDocRepository {
    constructor(
        @inject('CosmosDbSqlClient') sqlClient: ICosmosDbSqlClient,
        @inject(TelemetryService) protected telemetryService: TelemetryService
    ) {
        super(sqlClient, 'players', telemetryService)
    }

    /**
     * Get player by ID
     */
    async getPlayer(playerId: string): Promise<PlayerDoc | null> {
        const startTime = Date.now()

        try {
            // PlayerDoc uses id as partition key
            const player = await this.getById(playerId, playerId)

            this.telemetryService.trackGameEventStrict('PlayerDoc.Read', {
                playerId,
                found: player !== null,
                latencyMs: Date.now() - startTime
            })

            return player
        } catch (error) {
            this.telemetryService.trackGameEventStrict('PlayerDoc.Read', {
                playerId,
                found: false,
                error: true,
                latencyMs: Date.now() - startTime
            })
            throw error
        }
    }

    /**
     * Upsert player document (idempotent)
     * Uses last-write-wins semantics for concurrent updates
     */
    async upsertPlayer(playerDoc: PlayerDoc): Promise<void> {
        const startTime = Date.now()

        try {
            await this.upsert(playerDoc)

            this.telemetryService.trackGameEventStrict('PlayerDoc.Upsert', {
                playerId: playerDoc.id,
                latencyMs: Date.now() - startTime
            })
        } catch (error) {
            this.telemetryService.trackGameEventStrict('PlayerDoc.Upsert', {
                playerId: playerDoc.id,
                error: true,
                latencyMs: Date.now() - startTime
            })
            throw error
        }
    }

    /**
     * Delete player document (idempotent)
     */
    async deletePlayer(playerId: string): Promise<boolean> {
        const startTime = Date.now()
        let deleted = false
        try {
            // PlayerDoc uses id as partition key
            deleted = await this.delete(playerId, playerId)
            this.telemetryService.trackGameEventStrict('PlayerDoc.Delete', {
                playerId,
                deleted,
                latencyMs: Date.now() - startTime
            })
            return deleted
        } catch (error) {
            this.telemetryService.trackGameEventStrict('PlayerDoc.Delete', {
                playerId,
                error: true,
                deleted: false,
                latencyMs: Date.now() - startTime
            })
            throw error
        }
    }
}
