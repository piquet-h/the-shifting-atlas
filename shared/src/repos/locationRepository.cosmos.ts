import {isDirection} from '../domainModels.js'
import {GremlinClient} from '../gremlin/gremlinClient.js'
import {Location} from '../location.js'
import {ILocationRepository} from './locationRepository.js'

/** Cosmos (Gremlin) implementation of ILocationRepository. */
export class CosmosLocationRepository implements ILocationRepository {
    constructor(private client: GremlinClient) {}

    async get(id: string): Promise<Location | undefined> {
        const vertices = await this.client.submit<Record<string, unknown>>('g.V(locationId).valueMap(true)', {locationId: id})
        if (!vertices || vertices.length === 0) return undefined
        const v = vertices[0]
        const exitsRaw = await this.client.submit<Record<string, unknown>>(
            "g.V(locationId).outE('exit').project('direction','to','description').by(values('direction')).by(inV().id()).by(values('description'))",
            {locationId: id}
        )
        const exits = (exitsRaw || []).map((e: Record<string, unknown>) => ({
            direction: String(e.direction as string),
            to: String(e.to as string),
            description: e.description ? String(e.description as string) : undefined
        }))
        return {
            id: String(v.id || v['id']),
            name: firstScalar(v.name) || 'Unknown Location',
            description: firstScalar(v.description) || '',
            exits,
            version: typeof v.version === 'number' ? v.version : undefined
        }
    }

    async move(fromId: string, direction: string) {
        if (!isDirection(direction)) return {status: 'error', reason: 'no-exit'} as const
        const from = await this.get(fromId)
        if (!from) return {status: 'error', reason: 'from-missing'} as const
        const exit = from.exits?.find((e) => e.direction === direction)
        if (!exit || !exit.to) return {status: 'error', reason: 'no-exit'} as const
        const dest = await this.get(exit.to)
        if (!dest) return {status: 'error', reason: 'target-missing'} as const
        return {status: 'ok', location: dest} as const
    }
}

function firstScalar(val: unknown): string | undefined {
    if (val == null) return undefined
    if (Array.isArray(val)) return val.length ? String(val[0]) : undefined
    return String(val)
}
