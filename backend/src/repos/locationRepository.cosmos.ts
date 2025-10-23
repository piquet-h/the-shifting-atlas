import { Direction, ExitEdge, generateExitsSummary, getOppositeDirection, isDirection, Location } from '@piquet-h/shared'
import crypto from 'crypto'
import { GremlinClient } from '../gremlin/gremlinClient.js'
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

    /** Helper: Regenerate and update exits summary cache for a location */
    private async regenerateExitsSummaryCache(locationId: string): Promise<void> {
        // Fetch current exits
        const exitsRaw = await this.client.submit<Record<string, unknown>>(
            "g.V(locationId).outE('exit').project('direction','to','description','blocked').by(values('direction')).by(inV().id()).by(values('description')).by(values('blocked'))",
            { locationId }
        )

        // Convert to ExitEdge format
        const exits: ExitEdge[] = (exitsRaw || []).map((e: Record<string, unknown>) => ({
            fromLocationId: locationId,
            toLocationId: String(e.to as string),
            direction: String(e.direction as string) as Direction,
            description: e.description ? String(e.description as string) : undefined,
            blocked: e.blocked ? Boolean(e.blocked) : undefined
        }))

        // Generate summary
        const summary = generateExitsSummary(exits)

        // Update cache
        await this.updateExitsSummaryCache(locationId, summary)
    }

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
            version: typeof v.version === 'number' ? v.version : undefined,
            exitsSummaryCache: firstScalar(v.exitsSummaryCache) as string | undefined
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

        // Check if edge already exists
        const existingEdges = await this.client.submit<Record<string, unknown>>(
            "g.V(fid).outE('exit').has('direction', dir).where(inV().hasId(tid))",
            { fid: fromId, tid: toId, dir: direction }
        )

        if (existingEdges && existingEdges.length > 0) {
            // Edge already exists, not created
            return { created: false }
        }

        // Create new edge
        await this.client.submit("g.V(fid).as('a').addE('exit').to(V(tid)).property('direction', dir).property('description', desc)", {
            fid: fromId,
            tid: toId,
            dir: direction,
            desc: description || ''
        })

        // Regenerate exits summary cache for the source location
        await this.regenerateExitsSummaryCache(fromId)

        // Emit telemetry for actual creation
        trackGameEventStrict('World.Exit.Created', {
            fromLocationId: fromId,
            toLocationId: toId,
            dir: direction,
            kind: 'manual',
            genSource: undefined
        })

        return { created: true }
    }

    /** Ensure an exit edge with optional bidirectional creation */
    async ensureExitBidirectional(
        fromId: string,
        direction: string,
        toId: string,
        opts?: { reciprocal?: boolean; description?: string; reciprocalDescription?: string }
    ): Promise<{ created: boolean; reciprocalCreated?: boolean }> {
        if (!isDirection(direction)) return { created: false }
        const result = await this.ensureExit(fromId, direction, toId, opts?.description)
        if (!opts?.reciprocal) {
            return result
        }
        // Create reciprocal exit
        const oppositeDir = getOppositeDirection(direction)
        const reciprocalResult = await this.ensureExit(toId, oppositeDir, fromId, opts?.reciprocalDescription)
        return { created: result.created, reciprocalCreated: reciprocalResult.created }
    }

    /** Remove an exit edge */
    async removeExit(fromId: string, direction: string): Promise<{ removed: boolean }> {
        if (!isDirection(direction)) return { removed: false }

        // Find and remove matching edges
        const edges = await this.client.submit<Record<string, unknown>>("g.V(fid).outE('exit').has('direction', dir)", {
            fid: fromId,
            dir: direction
        })

        if (!edges || edges.length === 0) {
            return { removed: false }
        }

        // Get destination for telemetry before removing
        const toLocationId = edges.length > 0 ? String((edges[0] as Record<string, unknown>).inV || '') : undefined

        // Drop the edges
        await this.client.submit("g.V(fid).outE('exit').has('direction', dir).drop()", { fid: fromId, dir: direction })

        // Regenerate exits summary cache for the source location
        await this.regenerateExitsSummaryCache(fromId)

        // Emit telemetry for actual removal
        trackGameEventStrict('World.Exit.Removed', {
            fromLocationId: fromId,
            dir: direction,
            toLocationId
        })

        return { removed: true }
    }

    /** Batch apply multiple exits */
    async applyExits(
        exits: Array<{ fromId: string; direction: string; toId: string; description?: string; reciprocal?: boolean }>
    ): Promise<{ exitsCreated: number; exitsSkipped: number; reciprocalApplied: number }> {
        let exitsCreated = 0
        let exitsSkipped = 0
        let reciprocalApplied = 0

        // Group by fromId for potential optimization (future enhancement)
        for (const exit of exits) {
            const result = await this.ensureExitBidirectional(exit.fromId, exit.direction, exit.toId, {
                reciprocal: exit.reciprocal,
                description: exit.description
            })
            if (result.created) exitsCreated++
            else exitsSkipped++
            if (result.reciprocalCreated) reciprocalApplied++
        }

        return { exitsCreated, exitsSkipped, reciprocalApplied }
    }

    async updateExitsSummaryCache(locationId: string, cache: string): Promise<{ updated: boolean }> {
        try {
            await this.client.submit("g.V(locationId).property('exitsSummaryCache', cache)", { locationId, cache })
            return { updated: true }
        } catch {
            return { updated: false }
        }
    }
}

function firstScalar(val: unknown): string | undefined {
    if (val == null) return undefined
    if (Array.isArray(val)) return val.length ? String(val[0]) : undefined
    return String(val)
}
