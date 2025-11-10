/**
 * Cosmos SQL API implementation of IPlayerRepository.
 * Migrates player state from Gremlin graph to SQL API for cost-efficient mutable data storage.
 *
 * Backward compatibility: Falls back to Gremlin during migration period if player not found in SQL.
 */

import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import type { IPlayerRepository, PlayerRecord } from '@piquet-h/shared/types/playerRepository'
import { inject, injectable } from 'inversify'
import { trackGameEvent } from '../telemetry.js'
import { CosmosDbSqlRepository } from './base/CosmosDbSqlRepository.js'
import type { ICosmosDbSqlClient } from './base/cosmosDbSqlClient.js'
import type { IPlayerRepository as IGremlinPlayerRepository } from './playerRepository.js'

/**
 * SQL API document schema for player (matches PlayerRecord interface)
 */
interface PlayerDocument extends PlayerRecord {
    id: string
    createdUtc: string
    updatedUtc: string
    guest: boolean
    currentLocationId: string
}

@injectable()
export class CosmosPlayerRepositorySql extends CosmosDbSqlRepository<PlayerDocument> implements IPlayerRepository {
    private gremlinFallback?: IGremlinPlayerRepository

    constructor(
        @inject('CosmosDbSqlClient') sqlClient: ICosmosDbSqlClient,
        @inject('IPlayerRepository:Gremlin') gremlinFallback?: IGremlinPlayerRepository
    ) {
        super(sqlClient, 'players')
        this.gremlinFallback = gremlinFallback
    }

    async get(id: string): Promise<PlayerRecord | undefined> {
        const startTime = Date.now()

        // Try SQL API first
        const sqlPlayer = await this.getById(id, id)
        if (sqlPlayer) {
            trackGameEvent('Player.Get', {
                playerId: id,
                source: 'sql',
                latencyMs: Date.now() - startTime
            })
            return sqlPlayer
        }

        // Backward compatibility: Fall back to Gremlin during migration period
        if (this.gremlinFallback) {
            const gremlinPlayer = await this.gremlinFallback.get(id)
            if (gremlinPlayer) {
                trackGameEvent('Player.Get', {
                    playerId: id,
                    source: 'gremlin-fallback',
                    latencyMs: Date.now() - startTime
                })

                // Migrate player to SQL API on read
                await this.migratePlayerToSql(gremlinPlayer)

                return gremlinPlayer
            }
        }

        trackGameEvent('Player.Get', {
            playerId: id,
            source: 'not-found',
            latencyMs: Date.now() - startTime
        })

        return undefined
    }

    async getOrCreate(id?: string): Promise<{ record: PlayerRecord; created: boolean }> {
        const playerId = id || crypto.randomUUID()
        const startTime = Date.now()

        // Check if player exists in SQL
        if (id) {
            const existing = await this.get(id)
            if (existing) {
                trackGameEvent('Player.GetOrCreate', {
                    playerId: id,
                    created: false,
                    latencyMs: Date.now() - startTime
                })
                return { record: existing, created: false }
            }
        }

        // Create new player in SQL API
        const now = new Date().toISOString()
        const newPlayer: PlayerDocument = {
            id: playerId,
            createdUtc: now,
            updatedUtc: now,
            guest: true,
            currentLocationId: STARTER_LOCATION_ID
        }

        try {
            const { resource } = await this.create(newPlayer)
            trackGameEvent('Player.GetOrCreate', {
                playerId,
                created: true,
                latencyMs: Date.now() - startTime
            })
            return { record: resource, created: true }
        } catch (error) {
            // If creation fails due to conflict, player was created concurrently
            const cosmosError = error as { code?: number }
            if (cosmosError.code === 409) {
                const existing = await this.get(playerId)
                if (existing) {
                    trackGameEvent('Player.GetOrCreate', {
                        playerId,
                        created: false,
                        conflict: true,
                        latencyMs: Date.now() - startTime
                    })
                    return { record: existing, created: false }
                }
            }
            throw error
        }
    }

    async linkExternalId(
        id: string,
        externalId: string
    ): Promise<{ updated: boolean; record?: PlayerRecord; conflict?: boolean; existingPlayerId?: string }> {
        const startTime = Date.now()

        const existing = await this.get(id)
        if (!existing) {
            trackGameEvent('Player.LinkExternalId', {
                playerId: id,
                updated: false,
                reason: 'player-not-found',
                latencyMs: Date.now() - startTime
            })
            return { updated: false }
        }

        // Idempotent: if already linked to this externalId, no-op
        if (existing.externalId === externalId) {
            trackGameEvent('Player.LinkExternalId', {
                playerId: id,
                updated: false,
                reason: 'already-linked',
                latencyMs: Date.now() - startTime
            })
            return { updated: false, record: existing }
        }

        // Conflict detection: check if externalId is already linked to a different player
        const existingExternal = await this.findByExternalId(externalId)
        if (existingExternal && existingExternal.id !== id) {
            trackGameEvent('Player.LinkExternalId', {
                playerId: id,
                updated: false,
                conflict: true,
                existingPlayerId: existingExternal.id,
                latencyMs: Date.now() - startTime
            })
            return { updated: false, conflict: true, existingPlayerId: existingExternal.id }
        }

        // Update player with external ID
        const updatedPlayer: PlayerDocument = {
            ...existing,
            externalId,
            guest: false,
            updatedUtc: new Date().toISOString()
        } as PlayerDocument

        const { resource } = await this.upsert(updatedPlayer)
        trackGameEvent('Player.LinkExternalId', {
            playerId: id,
            updated: true,
            latencyMs: Date.now() - startTime
        })

        return { updated: true, record: resource }
    }

    async findByExternalId(externalId: string): Promise<PlayerRecord | undefined> {
        const startTime = Date.now()

        const queryText = 'SELECT * FROM c WHERE c.externalId = @externalId'
        const parameters = [{ name: '@externalId', value: externalId }]

        const { items } = await this.query(queryText, parameters, 1)

        if (items.length > 0) {
            trackGameEvent('Player.FindByExternalId', {
                found: true,
                latencyMs: Date.now() - startTime
            })
            return items[0]
        }

        trackGameEvent('Player.FindByExternalId', {
            found: false,
            latencyMs: Date.now() - startTime
        })

        return undefined
    }

    /**
     * Update player location (for player movement)
     * @param id - Player ID
     * @param locationId - New location ID
     */
    async updateLocation(id: string, locationId: string): Promise<PlayerRecord | undefined> {
        const startTime = Date.now()

        const existing = await this.get(id)
        if (!existing) {
            trackGameEvent('Player.UpdateLocation', {
                playerId: id,
                updated: false,
                reason: 'player-not-found',
                latencyMs: Date.now() - startTime
            })
            return undefined
        }

        const updatedPlayer: PlayerDocument = {
            ...existing,
            currentLocationId: locationId,
            updatedUtc: new Date().toISOString()
        } as PlayerDocument

        const { resource } = await this.upsert(updatedPlayer)
        trackGameEvent('Player.UpdateLocation', {
            playerId: id,
            locationId,
            updated: true,
            latencyMs: Date.now() - startTime
        })

        return resource
    }

    /**
     * Migrate a player from Gremlin to SQL API
     * @param player - Player record from Gremlin
     */
    private async migratePlayerToSql(player: PlayerRecord): Promise<void> {
        const startTime = Date.now()

        try {
            const playerDoc: PlayerDocument = {
                id: player.id,
                createdUtc: player.createdUtc,
                updatedUtc: player.updatedUtc || player.createdUtc,
                guest: player.guest,
                currentLocationId: player.currentLocationId || STARTER_LOCATION_ID,
                externalId: player.externalId,
                name: player.name
            }

            // Use upsert to avoid conflicts if player was migrated concurrently
            await this.upsert(playerDoc)

            trackGameEvent('Player.Migrate', {
                playerId: player.id,
                success: true,
                latencyMs: Date.now() - startTime
            })
        } catch (error) {
            // Log migration failure but don't throw (player read still succeeds via Gremlin)
            trackGameEvent('Player.Migrate', {
                playerId: player.id,
                success: false,
                latencyMs: Date.now() - startTime
            })
            console.warn(`Failed to migrate player ${player.id} to SQL:`, error)
        }
    }
}
