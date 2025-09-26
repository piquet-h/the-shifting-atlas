import {GremlinClient} from '../gremlin/gremlinClient.js'
import {IPlayerRepository, PlayerRecord} from './playerRepository.js'

export class CosmosPlayerRepository implements IPlayerRepository {
    constructor(private client: GremlinClient) {}

    async get(id: string): Promise<PlayerRecord | undefined> {
        const rows = await this.client.submit<Record<string, unknown>>("g.V(playerId).hasLabel('player').valueMap(true)", {playerId: id})
        if (!rows.length) return undefined
        const v = rows[0]
        return mapVertexToPlayer(v)
    }

    async getOrCreate(id?: string): Promise<{record: PlayerRecord; created: boolean}> {
        if (id) {
            const existing = await this.get(id)
            if (existing) return {record: existing, created: false}
        }
        const newId = id || cryptoRandomUUID()
        // Create vertex (optimistically; ignore race condition for now)
        await this.client.submit("g.addV('player').property('id', pid).property('createdUtc', created).property('guest', true)", {
            pid: newId,
            created: new Date().toISOString()
        })
        const rec = await this.get(newId)
        return {record: rec || {id: newId, createdUtc: new Date().toISOString(), guest: true}, created: true}
    }

    async linkExternalId(id: string, externalId: string): Promise<{updated: boolean; record?: PlayerRecord}> {
        const existing = await this.get(id)
        if (!existing) return {updated: false}
        await this.client.submit("g.V(pid).hasLabel('player').property('externalId', ext).property('guest', false)", {
            pid: id,
            ext: externalId
        })
        const updated = await this.get(id)
        return {updated: true, record: updated}
    }
}

function mapVertexToPlayer(v: Record<string, unknown>): PlayerRecord {
    return {
        id: String(v.id || v['id']),
        createdUtc: firstScalar(v.createdUtc) || new Date().toISOString(),
        guest: parseBool(firstScalar(v.guest)) ?? true,
        externalId: firstScalar(v.externalId) || undefined
    }
}

function firstScalar(val: unknown): string | undefined {
    if (val == null) return undefined
    if (Array.isArray(val)) return val.length ? String(val[0]) : undefined
    return String(val)
}

function parseBool(v: string | undefined): boolean | undefined {
    if (!v) return undefined
    return v === 'true' || v === '1'
}

function cryptoRandomUUID(): string {
    // Avoid importing node:crypto in shared to keep bundle light; fallback simple GUID subset generator.
    // This is only used if cosmos creates a player with no supplied id.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
    })
}
