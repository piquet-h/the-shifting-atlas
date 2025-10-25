import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import type { IPlayerRepository, PlayerRecord } from '@piquet-h/shared/types/playerRepository'
import { IGremlinClient } from '../gremlin/gremlinClient.js'
import { resolveGraphPartitionKey, WORLD_GRAPH_PARTITION_KEY_PROP } from '../persistence/graphPartition.js'

export class CosmosPlayerRepository implements IPlayerRepository {
    constructor(private client: IGremlinClient) {}

    async get(id: string): Promise<PlayerRecord | undefined> {
        const rows = await this.client.submit<Record<string, unknown>>("g.V(playerId).hasLabel('player').valueMap(true)", { playerId: id })
        if (!rows.length) return undefined
        const v = rows[0]
        return mapVertexToPlayer(v)
    }

    async getOrCreate(id?: string): Promise<{ record: PlayerRecord; created: boolean }> {
        if (id) {
            const existing = await this.get(id)
            if (existing) return { record: existing, created: false }
        }
        const newId = id || cryptoRandomUUID()
        // Upsert pattern (fold + coalesce) avoids duplicate vertex creation races for the same supplied id.
        // The preliminary get above is sufficient; no need for a second existence check.
        const createdIso = new Date().toISOString()
        await this.client.submit(
            `
                g.V(pid)
                    .hasLabel('player')
                    .fold()
                    .coalesce(
                        unfold(),
                        addV('player')
                            .property('id', pid)
                            .property('${WORLD_GRAPH_PARTITION_KEY_PROP}', pk)
                            .property('createdUtc', created)
                            .property('updatedUtc', created)
                            .property('guest', true)
                            .property('currentLocationId', startLoc)
                    )
            `,
            {
                pid: newId,
                pk: resolveGraphPartitionKey(),
                created: createdIso,
                startLoc: STARTER_LOCATION_ID
            }
        )
        const rec = await this.get(newId)
        return {
            record: rec || {
                id: newId,
                createdUtc: createdIso,
                updatedUtc: createdIso,
                guest: true,
                currentLocationId: STARTER_LOCATION_ID,
                name: undefined
            },
            created: true
        }
    }

    async linkExternalId(
        id: string,
        externalId: string
    ): Promise<{ updated: boolean; record?: PlayerRecord; conflict?: boolean; existingPlayerId?: string }> {
        const existing = await this.get(id)
        if (!existing) return { updated: false }
        // Idempotent: if already linked to this externalId, no-op (don't update timestamp)
        if (existing.externalId === externalId) {
            return { updated: false, record: existing }
        }
        // Conflict detection: check if externalId is already linked to a different player
        const existingExternal = await this.findByExternalId(externalId)
        if (existingExternal && existingExternal.id !== id) {
            return { updated: false, conflict: true, existingPlayerId: existingExternal.id }
        }
        const updatedIso = new Date().toISOString()
        await this.client.submit(
            "g.V(pid).hasLabel('player').property('externalId', ext).property('guest', false).property('updatedUtc', updated)",
            {
                pid: id,
                ext: externalId,
                updated: updatedIso
            }
        )
        const updated = await this.get(id)
        return { updated: true, record: updated }
    }

    async findByExternalId(externalId: string): Promise<PlayerRecord | undefined> {
        const rows = await this.client.submit<Record<string, unknown>>(
            "g.V().hasLabel('player').has('externalId', ext).limit(1).valueMap(true)",
            { ext: externalId }
        )
        if (!rows.length) return undefined
        return mapVertexToPlayer(rows[0])
    }
}

function mapVertexToPlayer(v: Record<string, unknown>): PlayerRecord {
    return {
        id: String(v.id || v['id']),
        createdUtc: firstScalar(v.createdUtc) || new Date().toISOString(),
        updatedUtc: firstScalar(v.updatedUtc) || firstScalar(v.createdUtc) || new Date().toISOString(),
        guest: parseBool(firstScalar(v.guest)) ?? true,
        externalId: firstScalar(v.externalId) || undefined,
        currentLocationId: firstScalar(v.currentLocationId) || STARTER_LOCATION_ID,
        name: firstScalar(v.name) || undefined
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
