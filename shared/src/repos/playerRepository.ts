import crypto from 'crypto'

export interface PlayerRecord {
    id: string
    createdUtc: string
    guest: boolean
    externalId?: string
}

export interface IPlayerRepository {
    get(id: string): Promise<PlayerRecord | undefined>
    getOrCreate(id?: string): Promise<{record: PlayerRecord; created: boolean}>
    linkExternalId(id: string, externalId: string): Promise<{updated: boolean; record?: PlayerRecord}>
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
        return {record: this.players.get(guid!)!, created}
    }
    async linkExternalId(id: string, externalId: string) {
        const rec = this.players.get(id)
        if (!rec) return {updated: false}
        rec.externalId = externalId
        rec.guest = false
        return {updated: true, record: rec}
    }
    private make(id: string): PlayerRecord {
        return {id, createdUtc: new Date().toISOString(), guest: true}
    }
}

let playerRepoSingleton: IPlayerRepository | undefined
export function getPlayerRepository(): IPlayerRepository {
    if (!playerRepoSingleton) playerRepoSingleton = new InMemoryPlayerRepository()
    return playerRepoSingleton
}

export function __resetPlayerRepositoryForTests() {
    playerRepoSingleton = undefined
}
