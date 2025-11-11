import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import type { IPlayerRepository, PlayerRecord } from '@piquet-h/shared/types/playerRepository'
import { injectable } from 'inversify'

/**
 * Mock implementation of IPlayerRepository for unit tests.
 * Provides predictable behavior and no side effects.
 */
@injectable()
export class MockPlayerRepository implements IPlayerRepository {
    private mockPlayers = new Map<string, PlayerRecord>()
    private mockExternalIds = new Map<string, string>() // externalId -> playerId

    // Test helpers to set up mock data
    setPlayer(id: string, record: PlayerRecord): void {
        this.mockPlayers.set(id, record)
        if (record.externalId) {
            this.mockExternalIds.set(record.externalId, id)
        }
    }

    clear(): void {
        this.mockPlayers.clear()
        this.mockExternalIds.clear()
    }

    async get(id: string): Promise<PlayerRecord | undefined> {
        return this.mockPlayers.get(id)
    }

    async getOrCreate(id?: string): Promise<{ record: PlayerRecord; created: boolean }> {
        if (id && this.mockPlayers.has(id)) {
            return { record: this.mockPlayers.get(id)!, created: false }
        }

        const newId = id || 'mock-player-id'
        const now = new Date().toISOString()
        const record: PlayerRecord = {
            id: newId,
            createdUtc: now,
            updatedUtc: now,
            guest: true,
            currentLocationId: STARTER_LOCATION_ID
        }

        this.mockPlayers.set(newId, record)
        return { record, created: true }
    }

    async linkExternalId(
        id: string,
        externalId: string
    ): Promise<{ updated: boolean; record?: PlayerRecord; conflict?: boolean; existingPlayerId?: string }> {
        const record = this.mockPlayers.get(id)
        if (!record) {
            return { updated: false }
        }

        // Check if already linked
        if (record.externalId === externalId) {
            return { updated: false, record }
        }

        // Check for conflicts
        const existingPlayerId = this.mockExternalIds.get(externalId)
        if (existingPlayerId && existingPlayerId !== id) {
            return { updated: false, conflict: true, existingPlayerId }
        }

        // Update
        record.externalId = externalId
        record.guest = false
        record.updatedUtc = new Date().toISOString()
        this.mockExternalIds.set(externalId, id)

        return { updated: true, record }
    }

    async findByExternalId(externalId: string): Promise<PlayerRecord | undefined> {
        const playerId = this.mockExternalIds.get(externalId)
        if (!playerId) return undefined
        return this.mockPlayers.get(playerId)
    }

    async update(player: PlayerRecord): Promise<PlayerRecord> {
        const existing = this.mockPlayers.get(player.id)
        if (!existing) {
            throw new Error(`Player ${player.id} not found`)
        }

        const updated: PlayerRecord = {
            ...player,
            updatedUtc: new Date().toISOString()
        }

        this.mockPlayers.set(player.id, updated)
        return updated
    }
}
