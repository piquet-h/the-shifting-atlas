import crypto from 'crypto'
import { isDirection } from '../domainModels.js'
import { GremlinClient } from '../gremlin/gremlinClient.js'
import { Location } from '../location.js'
import { WORLD_GRAPH_PARTITION_KEY_PROP, WORLD_GRAPH_PARTITION_VALUE } from '../persistence/graphPartition.js'
import { trackGameEventStrict } from '../telemetry.js'
import { ILocationRepository } from './locationRepository.js'

/** Compute content hash for revision tracking (name + description + sorted tags) */
function computeLocationContentHash(name: string, description: string, tags?: string[]): string {
    const sortedTags = tags && tags.length > 0 ? [...tags].sort() : []
    const content = JSON.stringify({ name, description, tags: sortedTags })
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex')
}

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
    async upsert(location: Location): Promise<{ created: boolean; id: string; updatedRevision?: number }> {
        // Input validation
        if (!location.id || !location.name || location.description === undefined) {
            const error = new Error('Location missing required fields (id, name, description)')
            trackGameEventStrict('World.Location.Upsert', {
                locationId: location.id || 'unknown',
                latencyMs: 0,
                success: false,
                reason: 'validation-error'
            })
            throw error
        }

        const startTime = Date.now()
        let success = false
        let created = false
        let reason: string | undefined
        let updatedRevision: number | undefined

        try {
            // Compute content hash for the new location
            const newContentHash = computeLocationContentHash(location.name, location.description, location.tags)

            // First, check if the location exists to determine if this is create vs update
            const existingVertices = await this.client.submit<Record<string, unknown>>('g.V(lid).valueMap(true)', { lid: location.id })
            const exists = existingVertices && existingVertices.length > 0
            created = !exists

            let newVersion = 1 // Default version for new locations
            let shouldIncrementRevision = true

            if (exists) {
                // If updating, check if content has changed
                const existing = existingVertices[0]
                const currentVersion = typeof existing.version === 'number' ? existing.version : 0

                // Extract existing content for comparison
                const existingName = firstScalar(existing.name) || ''
                const existingDescription = firstScalar(existing.description) || ''
                const existingTags = Array.isArray(existing.tags) ? (existing.tags as string[]) : undefined
                const existingContentHash = computeLocationContentHash(existingName, existingDescription, existingTags)

                // Only increment revision if content changed
                if (existingContentHash === newContentHash) {
                    shouldIncrementRevision = false
                    newVersion = currentVersion
                } else {
                    shouldIncrementRevision = true
                    newVersion = currentVersion + 1
                }
            } else if (location.version !== undefined) {
                // For new locations, use provided version if specified
                newVersion = location.version
            }

            // Perform the upsert with the calculated version
            const bindings: Record<string, unknown> = {
                lid: location.id,
                name: location.name,
                desc: location.description || '',
                ver: newVersion,
                pk: WORLD_GRAPH_PARTITION_VALUE // Partition key required by Cosmos Gremlin API
            }
            if (location.tags) {
                bindings.tags = location.tags
            }

            await this.client.submit(
                `g.V(lid).fold().coalesce(unfold(), addV('location').property('id', lid).property('${WORLD_GRAPH_PARTITION_KEY_PROP}', pk))` +
                    ".property('name', name).property('description', desc).property('version', ver)" +
                    (location.tags ? ".property('tags', tags)" : ''),
                bindings
            )

            success = true
            updatedRevision = shouldIncrementRevision ? newVersion : undefined
            return { created, id: location.id, updatedRevision }
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
                revision: success ? updatedRevision : undefined,
                ru: undefined, // RU tracking not available from Gremlin client
                reason: success ? undefined : reason
            })
        }
    }

    /** Ensure an exit edge with direction exists between fromId and toId */
    async ensureExit(fromId: string, direction: string, toId: string, description?: string): Promise<{ created: boolean }> {
        if (!isDirection(direction)) return { created: false }
        // Ensure both vertices exist (no-op if present); include partitionKey for Cosmos Gremlin API requirement
        await this.client.submit(
            `g.V(fid).fold().coalesce(unfold(), addV('location').property('id', fid).property('${WORLD_GRAPH_PARTITION_KEY_PROP}', pk))`,
            { fid: fromId, pk: WORLD_GRAPH_PARTITION_VALUE }
        )
        await this.client.submit(
            `g.V(tid).fold().coalesce(unfold(), addV('location').property('id', tid).property('${WORLD_GRAPH_PARTITION_KEY_PROP}', pk))`,
            { tid: toId, pk: WORLD_GRAPH_PARTITION_VALUE }
        )
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
