import { STARTER_LOCATION_ID, type PlayerDoc } from '@piquet-h/shared'
import type { IPlayerRepository, PlayerRecord } from '@piquet-h/shared/types/playerRepository'
import crypto from 'crypto'
import { injectable } from 'inversify'
import type { IPlayerDocRepository } from './PlayerDocRepository.js'
import { projectPlayerDoc, projectPlayerRecord } from './utils/playerDocumentProjection.js'

/**
 * Validates that a string is a valid UUID v4.
 * Returns true only for properly formatted UUID v4 (version 4, variant 1).
 */
function isValidUuidV4(value: string | undefined): boolean {
    if (!value || typeof value !== 'string') return false
    const trimmed = value.trim()
    if (trimmed.length === 0) return false
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    return uuidV4Regex.test(trimmed)
}

/**
 * Shared in-memory backing store implementing both `IPlayerRepository` (Auth/Identity/Movement)
 * and `IPlayerDocRepository` (Gameplay/Clocks/MCP) so local dev and integration tests keep
 * identity and character state synchronized without leaking auth fields into `PlayerDoc`.
 */
@injectable()
export class InMemoryPlayerRepository implements IPlayerRepository, IPlayerDocRepository {
    protected players = new Map<string, Record<string, unknown>>()

    async get(id: string): Promise<PlayerRecord | undefined> {
        const stored = this.players.get(id)
        return stored ? projectPlayerRecord(stored) : undefined
    }

    async getOrCreate(id?: string): Promise<{ record: PlayerRecord; created: boolean }> {
        let created = false
        let guid: string | undefined = id

        const hasValidId = isValidUuidV4(guid)

        if (!hasValidId) {
            guid = crypto.randomUUID()
            created = true
            this.players.set(guid, this.make(guid))
        } else {
            guid = guid!.trim()
            if (!this.players.has(guid)) {
                created = true
                this.players.set(guid, this.make(guid))
            } else {
                created = false
            }
        }

        const stored = this.players.get(guid)!
        if (!stored.currentLocationId) {
            stored.currentLocationId = resolveStartLocationId()
            stored.updatedUtc = new Date().toISOString()
        }
        return { record: projectPlayerRecord(stored), created }
    }

    async linkExternalId(
        id: string,
        externalId: string
    ): Promise<{ updated: boolean; record?: PlayerRecord; conflict?: boolean; existingPlayerId?: string }> {
        const stored = this.players.get(id)
        if (!stored) return { updated: false }

        if (stored.externalId === externalId) {
            return { updated: false, record: projectPlayerRecord(stored) }
        }

        const existing = await this.findByExternalId(externalId)
        if (existing && existing.id !== id) {
            return { updated: false, conflict: true, existingPlayerId: existing.id }
        }

        stored.externalId = externalId
        stored.guest = false
        stored.updatedUtc = new Date().toISOString()
        return { updated: true, record: projectPlayerRecord(stored) }
    }

    async findByExternalId(externalId: string): Promise<PlayerRecord | undefined> {
        for (const p of this.players.values()) {
            if (p.externalId === externalId) return projectPlayerRecord(p)
        }
        return undefined
    }

    async listAll(): Promise<PlayerRecord[]> {
        return Array.from(this.players.values()).map((player) => projectPlayerRecord(player))
    }

    async update(player: PlayerRecord): Promise<PlayerRecord> {
        const existing = this.players.get(player.id)
        if (!existing) {
            throw new Error(`Player ${player.id} not found`)
        }

        const merged: Record<string, unknown> = {
            ...existing,
            ...player,
            updatedUtc: new Date().toISOString()
        }

        this.players.set(player.id, merged)
        return projectPlayerRecord(merged)
    }

    // --- IPlayerDocRepository implementation over the same backing Map ---

    async getPlayer(playerId: string): Promise<PlayerDoc | null> {
        const stored = this.players.get(playerId)
        return stored ? projectPlayerDoc(stored) : null
    }

    async upsertPlayer(playerDoc: PlayerDoc): Promise<void> {
        const existing = this.players.get(playerDoc.id)
        const merged: Record<string, unknown> = {
            ...(existing ?? { guest: true }),
            ...playerDoc
        }
        this.players.set(playerDoc.id, merged)
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
                results.push(projectPlayerDoc(player))
                if (results.length >= maxResults) break
            }
        }
        return results
    }

    clear(): void {
        this.players.clear()
    }

    getAllPlayers(): PlayerDoc[] {
        return Array.from(this.players.values()).map((p) => projectPlayerDoc(p))
    }

    private make(id: string): Record<string, unknown> {
        const now = new Date().toISOString()
        return {
            id,
            createdUtc: now,
            updatedUtc: now,
            guest: true,
            currentLocationId: resolveStartLocationId()
        }
    }
}

function resolveStartLocationId(): string {
    return process.env.START_LOCATION_ID || STARTER_LOCATION_ID
}
