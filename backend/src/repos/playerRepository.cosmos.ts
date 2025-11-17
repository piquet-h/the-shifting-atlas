import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import type { PlayerRecord } from '@piquet-h/shared/types/playerRepository'
import { inject, injectable } from 'inversify'
import type { IGremlinClient } from '../gremlin/gremlinClient.js'
import { CosmosGremlinRepository } from './base/index.js'
import { firstScalar, parseBool } from './utils/index.js'

/**
 * @deprecated Read-only fallback for disaster recovery. All player writes go to SQL API.
 * This repository only provides read operations for legacy Gremlin-stored players.
 * Migration complete as of issue #519 (2025-11-17).
 */
@injectable()
export class CosmosPlayerRepository extends CosmosGremlinRepository {
    constructor(@inject('GremlinClient') client: IGremlinClient) {
        super(client)
    }

    async get(id: string): Promise<PlayerRecord | undefined> {
        const rows = await this.query<Record<string, unknown>>("g.V(playerId).hasLabel('player').valueMap(true)", { playerId: id })
        if (!rows.length) return undefined
        const v = rows[0]
        return mapVertexToPlayer(v)
    }

    async findByExternalId(externalId: string): Promise<PlayerRecord | undefined> {
        const rows = await this.query<Record<string, unknown>>("g.V().hasLabel('player').has('externalId', ext).limit(1).valueMap(true)", {
            ext: externalId
        })
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
