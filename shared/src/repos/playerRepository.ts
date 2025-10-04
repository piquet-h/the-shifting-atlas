import crypto from 'crypto'
import { createGremlinClient } from '../gremlin/gremlinClient.js'
import { STARTER_LOCATION_ID } from '../location.js'
import { loadPersistenceConfigAsync, resolvePersistenceMode } from '../persistenceConfig.js'
import { CosmosPlayerRepository } from './playerRepository.cosmos.js'

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
    linkExternalId(id: string, externalId: string): Promise<{ updated: boolean; record?: PlayerRecord }>
    findByExternalId(externalId: string): Promise<PlayerRecord | undefined>
}

class InMemoryPlayerRepository implements IPlayerRepository {
    private players = new Map<string, PlayerRecord>()
    async get(id: string) {
        return this.players.get(id)
    }
    async getOrCreate(id?: string) {
        let created = false
        let guid = id
        if (guid && !this.players.has(guid)) {
            created = true
            this.players.set(guid, this.make(guid))
        } else if (!guid) {
            guid = crypto.randomUUID()
            created = true
            this.players.set(guid, this.make(guid))
        }
        const rec = this.players.get(guid!)!
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
        rec.externalId = externalId
        rec.guest = false
        return { updated: true, record: rec }
    }
    async findByExternalId(externalId: string) {
        for (const p of this.players.values()) {
            if (p.externalId === externalId) return p
        }
        return undefined
    }
    private make(id: string): PlayerRecord {
        return {
            id,
            createdUtc: new Date().toISOString(),
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
                        const client = await pending
                        const rows = await client.submit<Record<string, unknown>>("g.V(playerId).hasLabel('player').valueMap(true)", {
                            playerId: id
                        })
                        if (!rows.length) return undefined
                        const v = rows[0]
                        const idVal = (v as Record<string, unknown>).id || (v as Record<string, unknown>)['id']
                        return { id: String(idVal), createdUtc: new Date().toISOString(), guest: true }
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
