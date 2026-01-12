/**
 * In-memory implementation of IPlayerDocRepository for testing.
 * No Azure dependencies required.
 */

import type { PlayerDoc } from '@piquet-h/shared'
import { injectable } from 'inversify'
import type { IPlayerDocRepository } from './PlayerDocRepository.js'

@injectable()
export class MemoryPlayerDocRepository implements IPlayerDocRepository {
    private players = new Map<string, PlayerDoc>()

    async getPlayer(playerId: string): Promise<PlayerDoc | null> {
        return this.players.get(playerId) || null
    }

    async upsertPlayer(playerDoc: PlayerDoc): Promise<void> {
        // Idempotent upsert (create or update)
        const existing = this.players.get(playerDoc.id)

        if (existing) {
            // Update existing player with last-write-wins semantics
            this.players.set(playerDoc.id, { ...playerDoc })
        } else {
            // Create new player
            this.players.set(playerDoc.id, { ...playerDoc })
        }
    }

    async deletePlayer(playerId: string): Promise<boolean> {
        return this.players.delete(playerId)
    }

    async listPlayerIdsByPrefixes(prefixes: string[], maxResults: number = 1000): Promise<string[]> {
        if (prefixes.length === 0) return []
        const results: string[] = []
        for (const id of this.players.keys()) {
            if (prefixes.some((p) => id.startsWith(p))) {
                results.push(id)
                if (results.length >= maxResults) break
            }
        }
        return results
    }

    async listPlayersAtLocation(locationId: string, maxResults: number = 20): Promise<PlayerDoc[]> {
        const results: PlayerDoc[] = []
        for (const player of this.players.values()) {
            if (player.currentLocationId === locationId) {
                results.push({ ...player })
                if (results.length >= maxResults) break
            }
        }
        return results
    }

    /**
     * Clear all players (for test cleanup)
     */
    clear(): void {
        this.players.clear()
    }

    /**
     * Get all players (for test assertions)
     */
    getAllPlayers(): PlayerDoc[] {
        return Array.from(this.players.values())
    }
}
