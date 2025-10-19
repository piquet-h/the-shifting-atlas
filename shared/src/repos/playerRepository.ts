import crypto from 'crypto'
import { createGremlinClient } from '../gremlin/gremlinClient.js'
import { STARTER_LOCATION_ID } from '../location.js'
import { loadPersistenceConfigAsync, resolvePersistenceMode } from '../persistenceConfig.js'
import { CosmosPlayerRepository } from './playerRepository.cosmos.js'

/**
 * Validates that a string is a valid UUID v4.
 * Returns true only for properly formatted UUID v4 (version 4, variant 1).
 */
function isValidUuidV4(value: string | undefined): boolean {
    if (!value || typeof value !== 'string') return false
    // Trim whitespace and check if empty
    const trimmed = value.trim()
    if (trimmed.length === 0) return false
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    // where y is one of [8, 9, a, b] (variant bits)
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    return uuidV4Regex.test(trimmed)
}

export interface PlayerRecord {
    id: string
    createdUtc: string
    /** ISO timestamp updated whenever mutable fields change. */
    updatedUtc?: string
    guest: boolean
    /** Optional federated / external identity mapping (e.g., Entra sub). */
    externalId?: string
    /** Bootstrap-assigned or user chosen display name (temporary). */
    name?: string
    /** Player's current location anchor (mirrors planned (player)-[:in]->(location) edge). */
    currentLocationId?: string
}

export interface IPlayerRepository {
    get(id: string): Promise<PlayerRecord | undefined>
    getOrCreate(id?: string): Promise<{ record: PlayerRecord; created: boolean }>
    linkExternalId(
        id: string,
        externalId: string
    ): Promise<{ updated: boolean; record?: PlayerRecord; conflict?: boolean; existingPlayerId?: string }>
    findByExternalId(externalId: string): Promise<PlayerRecord | undefined>
}

class InMemoryPlayerRepository implements IPlayerRepository {
    private players = new Map<string, PlayerRecord>()
    async get(id: string) {
        return this.players.get(id)
    }
    async getOrCreate(id?: string) {
        let created = false
        let guid: string | undefined = id

        // Validate the provided ID
        const hasValidId = isValidUuidV4(guid)

        if (!hasValidId) {
            // Invalid, empty, or no GUID provided - generate new UUID
            guid = crypto.randomUUID()
            created = true
            this.players.set(guid, this.make(guid))
        } else {
            // Valid UUID provided
            guid = guid!.trim()
            if (!this.players.has(guid)) {
                // New player with this GUID
                created = true
                this.players.set(guid, this.make(guid))
            } else {
                // Existing player
                created = false
            }
        }

        const rec = this.players.get(guid)!
        // Backfill any missing anchor fields (e.g., after interface extension) lazily.
        if (!rec.currentLocationId) {
            rec.currentLocationId = resolveStartLocationId()
            rec.updatedUtc = new Date().toISOString()
        }
        return { record: rec, created }
    }
    async linkExternalId(id: string, externalId: string) {
        const rec = this.players.get(id)
        if (!rec) return { updated: false }
        // Idempotent: if already linked to this externalId, no-op (don't update timestamp)
        if (rec.externalId === externalId) {
            return { updated: false, record: rec }
        }
        // Conflict detection: check if externalId is already linked to a different player
        const existing = await this.findByExternalId(externalId)
        if (existing && existing.id !== id) {
            return { updated: false, conflict: true, existingPlayerId: existing.id }
        }
        rec.externalId = externalId
        rec.guest = false
        // Track mutation timestamp for analytics / future conflict resolution logic.
        rec.updatedUtc = new Date().toISOString()
        return { updated: true, record: rec }
    }
    async findByExternalId(externalId: string) {
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

let playerRepoSingleton: IPlayerRepository | undefined
export async function getPlayerRepository(): Promise<IPlayerRepository> {
    if (playerRepoSingleton) return playerRepoSingleton
    const mode = resolvePersistenceMode()
    if (mode === 'cosmos') {
        const strict =
            typeof process !== 'undefined' && (process.env.PERSISTENCE_STRICT === '1' || process.env.PERSISTENCE_STRICT === 'true')
        try {
            const cfg = await loadPersistenceConfigAsync()
            if (cfg.mode === 'cosmos' && cfg.cosmos) {
                const pending = createGremlinClient(cfg.cosmos)
                const proxy: IPlayerRepository = {
                    async get(id: string) {
                        // Reuse full CosmosPlayerRepository mapping logic to ensure all expected properties
                        // (currentLocationId, externalId, updatedUtc) are returned consistently.
                        const repo = new CosmosPlayerRepository(await pending)
                        return repo.get(id)
                    },
                    async getOrCreate(id?: string) {
                        const repo = new CosmosPlayerRepository(await pending)
                        return repo.getOrCreate(id)
                    },
                    async linkExternalId(id: string, externalId: string) {
                        const repo = new CosmosPlayerRepository(await pending)
                        return repo.linkExternalId(id, externalId)
                    },
                    async findByExternalId(externalId: string) {
                        const repo = new CosmosPlayerRepository(await pending)
                        return repo.findByExternalId(externalId)
                    }
                }
                playerRepoSingleton = proxy
                return playerRepoSingleton
            }
        } catch (err) {
            if (strict) {
                throw err instanceof Error ? err : new Error('Cosmos player repository initialization failed in strict mode.')
            }
            // non-strict: ignore and fall back
        }
    }
    playerRepoSingleton = new InMemoryPlayerRepository()
    return playerRepoSingleton
}

export function __resetPlayerRepositoryForTests() {
    playerRepoSingleton = undefined
}

// Resolve starting location id (env override primarily for tests / future seeding scenarios)
function resolveStartLocationId(): string {
    return process.env.START_LOCATION_ID || STARTER_LOCATION_ID
}
