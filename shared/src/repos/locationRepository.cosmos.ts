import { isDirection } from '../domainModels.js'
import { GremlinClient } from '../gremlin/gremlinClient.js'
import { Location } from '../location.js'
import { trackGameEventStrict } from '../telemetry.js'
import { ILocationRepository } from './locationRepository.js'

/** Cosmos (Gremlin) implementation of ILocationRepository. */
export class CosmosLocationRepository implements ILocationRepository {
    constructor(private client: GremlinClient) {}

    async get(id: string): Promise<Location | undefined> {
        const vertices = await this.client.submit<Record<string, unknown>>('g.V(locationId).valueMap(true)', { locationId: id })
        if (!vertices || vertices.length === 0) return undefined
        const v = vertices[0]
        const exitsRaw = await this.client.submit<Record<string, unknown>>(
            "g.V(locationId).outE('exit').project('direction','to','description').by(values('direction')).by(inV().id()).by(values('description'))",
            { locationId: id }
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
            tags: Array.isArray(v.tags) ? (v.tags as string[]) : undefined,
            version: typeof v.version === 'number' ? v.version : undefined
        }
    }

    async move(fromId: string, direction: string) {
        if (!isDirection(direction)) return { status: 'error', reason: 'no-exit' } as const
        const from = await this.get(fromId)
        if (!from) return { status: 'error', reason: 'from-missing' } as const
        const exit = from.exits?.find((e) => e.direction === direction)
        if (!exit || !exit.to) return { status: 'error', reason: 'no-exit' } as const
        const dest = await this.get(exit.to)
        if (!dest) return { status: 'error', reason: 'target-missing' } as const
        return { status: 'ok', location: dest } as const
    }

    /** Upsert (idempotent) a location vertex. */
    async upsert(location: Location): Promise<{ created: boolean; id: string }> {
        const startTime = Date.now()
        let success = false
        let created = false
        let reason: string | undefined

        try {
            // First, check if the location exists to determine if this is create vs update
            const existingVertices = await this.client.submit<Record<string, unknown>>('g.V(lid).valueMap(true)', { lid: location.id })
            const exists = existingVertices && existingVertices.length > 0
            created = !exists

            let newVersion = 1 // Default version for new locations
            if (exists) {
                // If updating, increment version from existing
                const existing = existingVertices[0]
                const currentVersion = typeof existing.version === 'number' ? existing.version : 0
                newVersion = currentVersion + 1
            } else if (location.version !== undefined) {
                // For new locations, use provided version if specified
                newVersion = location.version
            }

            // Perform the upsert with the calculated version
            const bindings: Record<string, unknown> = {
                lid: location.id,
                name: location.name,
                desc: location.description || '',
                ver: newVersion
            }
            if (location.tags) {
                bindings.tags = location.tags
            }

            await this.client.submit(
                "g.V(lid).fold().coalesce(unfold(), addV('location').property('id', lid))" +
                    ".property('name', name).property('description', desc).property('version', ver)" +
                    (location.tags ? ".property('tags', tags)" : ''),
                bindings
            )

            success = true
            return { created, id: location.id }
        } catch (error) {
            success = false
            reason = error instanceof Error ? error.message : 'Unknown error'
            throw error
        } finally {
            const latencyMs = Date.now() - startTime
            trackGameEventStrict('World.Location.Upsert', {
                locationId: location.id,
                latencyMs,
                success,
                created: success ? created : undefined,
                reason: success ? undefined : reason
            })
        }
    }

    /** Ensure an exit edge with direction exists between fromId and toId */
    async ensureExit(fromId: string, direction: string, toId: string, description?: string): Promise<{ created: boolean }> {
        if (!isDirection(direction)) return { created: false }
        // Ensure both vertices exist (no-op if present)
        await this.client.submit("g.V(fid).fold().coalesce(unfold(), addV('location').property('id', fid))", { fid: fromId })
        await this.client.submit("g.V(tid).fold().coalesce(unfold(), addV('location').property('id', tid))", { tid: toId })
        // Use coalesce on existing edge
        await this.client.submit(
            "g.V(fid).as('a').V(tid).coalesce( a.outE('exit').has('direction', dir).where(inV().hasId(tid)), addE('exit').from('a').to(V(tid)).property('direction', dir).property('description', desc) )",
            { fid: fromId, tid: toId, dir: direction, desc: description || '' }
        )
        return { created: false }
    }
}

function firstScalar(val: unknown): string | undefined {
    if (val == null) return undefined
    if (Array.isArray(val)) return val.length ? String(val[0]) : undefined
    return String(val)
}
