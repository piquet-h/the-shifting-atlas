import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import type { IPlayerRepository, PlayerRecord } from '@piquet-h/shared/types/playerRepository'
import crypto from 'crypto'
import { injectable } from 'inversify'

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
 * In-memory implementation of IPlayerRepository.
 * Used for memory mode and integration tests.
 */
@injectable()
export class InMemoryPlayerRepository implements IPlayerRepository {
    private players = new Map<string, PlayerRecord>()

    async get(id: string): Promise<PlayerRecord | undefined> {
        return this.players.get(id)
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

        const rec = this.players.get(guid)!
        if (!rec.currentLocationId) {
            rec.currentLocationId = resolveStartLocationId()
            rec.updatedUtc = new Date().toISOString()
        }
        return { record: rec, created }
    }

    async linkExternalId(
        id: string,
        externalId: string
    ): Promise<{ updated: boolean; record?: PlayerRecord; conflict?: boolean; existingPlayerId?: string }> {
        const rec = this.players.get(id)
        if (!rec) return { updated: false }

        if (rec.externalId === externalId) {
            return { updated: false, record: rec }
        }

        const existing = await this.findByExternalId(externalId)
        if (existing && existing.id !== id) {
            return { updated: false, conflict: true, existingPlayerId: existing.id }
        }

        rec.externalId = externalId
        rec.guest = false
        rec.updatedUtc = new Date().toISOString()
        return { updated: true, record: rec }
    }

    async findByExternalId(externalId: string): Promise<PlayerRecord | undefined> {
        for (const p of this.players.values()) {
            if (p.externalId === externalId) return p
        }
        return undefined
    }

    private make(id: string): PlayerRecord {
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
