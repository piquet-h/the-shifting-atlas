import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import type { IPlayerRepository, PlayerRecord } from '@piquet-h/shared/types/playerRepository'
import { inject, injectable } from 'inversify'
import type { IGremlinClient } from '../gremlin/gremlinClient.js'
import { WORLD_GRAPH_PARTITION_KEY_PROP } from '../persistence/graphPartition.js'
import { CosmosGremlinRepository } from './base/index.js'
import { firstScalar, parseBool } from './utils/index.js'

@injectable()
export class CosmosPlayerRepository extends CosmosGremlinRepository implements IPlayerRepository {
    constructor(@inject('GremlinClient') client: IGremlinClient) {
        super(client)
    }

    async get(id: string): Promise<PlayerRecord | undefined> {
        const rows = await this.query<Record<string, unknown>>("g.V(playerId).hasLabel('player').valueMap(true)", { playerId: id })
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
        await this.queryWithTelemetry(
            'player.create',
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
        await this.query(
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
        const rows = await this.query<Record<string, unknown>>("g.V().hasLabel('player').has('externalId', ext).limit(1).valueMap(true)", {
            ext: externalId
        })
        if (!rows.length) return undefined
        return mapVertexToPlayer(rows[0])
    }

    async update(player: PlayerRecord): Promise<PlayerRecord> {
        const existing = await this.get(player.id)
        if (!existing) {
            throw new Error(`Player ${player.id} not found`)
        }

        const updatedIso = new Date().toISOString()
        await this.query(
            "g.V(pid).hasLabel('player').property('updatedUtc', updated).property('currentLocationId', loc).property('guest', g).property('name', n)",
            {
                pid: player.id,
                updated: updatedIso,
                loc: player.currentLocationId || STARTER_LOCATION_ID,
                g: player.guest,
                n: player.name || null
            }
        )

        const updated = await this.get(player.id)
        if (!updated) {
            throw new Error(`Failed to retrieve updated player ${player.id}`)
        }
        return updated
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

function cryptoRandomUUID(): string {
    // Fallback simple GUID generator for edge cases where Cosmos creates a player with no supplied id.
    // This is rarely used; most player creation uses crypto.randomUUID() from the calling code.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
    })
}
