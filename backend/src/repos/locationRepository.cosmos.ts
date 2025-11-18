import { Direction, ExitEdge, generateExitsSummary, getOppositeDirection, isDirection, Location } from '@piquet-h/shared'
import { inject, injectable } from 'inversify'
import type { IGremlinClient } from '../gremlin/gremlinClient.js'
import { WORLD_GRAPH_PARTITION_KEY_PROP } from '../persistence/graphPartition.js'
import { TelemetryService } from '../telemetry/TelemetryService.js'
import { CosmosGremlinRepository } from './base/index.js'
import { ILocationRepository } from './locationRepository.js'
import { computeContentHash, firstScalar } from './utils/index.js'

/** Cosmos (Gremlin) implementation of ILocationRepository. */
@injectable()
export class CosmosLocationRepository extends CosmosGremlinRepository implements ILocationRepository {
    constructor(
        @inject('GremlinClient') client: IGremlinClient,
        protected telemetryService: TelemetryService
    ) {
        super(client, telemetryService)
    }

    /** Helper: Regenerate and update exits summary cache for a location */
    async regenerateExitsSummaryCache(locationId: string): Promise<void> {
        // Fetch current exits (use coalesce to handle missing optional properties)
        const exitsRaw = await this.query<Record<string, unknown>>(
            "g.V(locationId).outE('exit').project('direction','to','description','blocked')" +
                ".by(values('direction')).by(inV().id())" +
                ".by(coalesce(values('description'), constant('')))" +
                ".by(coalesce(values('blocked'), constant(false)))",
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
        try {
            const vertices = await this.query<Record<string, unknown>>('g.V(locationId).valueMap(true)', { locationId: id })
            if (!vertices || vertices.length === 0) {
                console.debug(`[LocationRepository.get] Location not found: ${id}`)
                return undefined
            }
            const v = vertices[0]

            // Fetch exits with better error handling and coalesce for optional properties
            let exits: Array<{ direction: string; to?: string; description?: string }> = []
            try {
                const exitsRaw = await this.query<Record<string, unknown>>(
                    "g.V(locationId).outE('exit').project('direction','to','description')" +
                        ".by(values('direction')).by(inV().id())" +
                        ".by(coalesce(values('description'), constant('')))",
                    { locationId: id }
                )
                exits = (exitsRaw || []).map((e: Record<string, unknown>) => ({
                    direction: String(e.direction as string),
                    to: String(e.to as string),
                    description: e.description ? String(e.description as string) : undefined
                }))

                console.debug(`[LocationRepository.get] Location ${id} has ${exits.length} exits`)
            } catch (error) {
                console.error(`[LocationRepository.get] Error fetching exits for location ${id}:`, error)
                // Return location without exits rather than failing completely
                exits = []
            }

            return {
                id: String(v.id || v['id']),
                name: firstScalar(v.name) || 'Unknown Location',
                description: firstScalar(v.description) || '',
                exits,
                tags: Array.isArray(v.tags) ? (v.tags as string[]) : undefined,
                version: typeof v.version === 'number' ? v.version : undefined,
                exitsSummaryCache: firstScalar(v.exitsSummaryCache) as string | undefined
            }
        } catch (error) {
            console.error(`[LocationRepository.get] Error fetching location ${id}:`, error)
            throw error // Re-throw so callers can handle appropriately
        }
    }

    /** List all location vertices (used for reconciliation). */
    async listAll(): Promise<Location[]> {
        const vertices = await this.query<Record<string, unknown>>("g.V().hasLabel('location').valueMap(true)")
        const results: Location[] = []
        for (const v of vertices || []) {
            results.push({
                id: String(v.id || v['id']),
                name: firstScalar(v.name) || 'Unknown Location',
                description: firstScalar(v.description) || '',
                tags: Array.isArray(v.tags) ? (v.tags as string[]) : undefined,
                version: typeof v.version === 'number' ? v.version : undefined
                // exits omitted for listAll to reduce query volume – caller may refetch if needed
            })
        }
        return results
    }

    async move(fromId: string, direction: string) {
        try {
            // Validate direction first (cheap operation)
            if (!isDirection(direction)) {
                console.warn(`[LocationRepository.move] Invalid direction: ${direction} from location: ${fromId}`)
                return { status: 'error', reason: 'no-exit' } as const
            }

            // Get source location with detailed error logging
            let from: Location | undefined
            try {
                from = await this.get(fromId)
            } catch (error) {
                console.error(`[LocationRepository.move] Error fetching source location ${fromId}:`, error)
                const errorMessage = error instanceof Error ? error.message : 'Unknown error'
                return { status: 'error', reason: `from-location-query-failed: ${errorMessage}` } as const
            }

            if (!from) {
                console.warn(`[LocationRepository.move] Source location not found: ${fromId}`)
                return { status: 'error', reason: 'from-missing' } as const
            }

            // Log current location state for debugging
            console.debug(`[LocationRepository.move] Source location ${fromId} has ${from.exits?.length || 0} exits`)

            // Find exit in the specified direction
            const exit = from.exits?.find((e) => e.direction === direction)
            if (!exit || !exit.to) {
                console.warn(
                    `[LocationRepository.move] No exit in direction '${direction}' from location ${fromId}. ` +
                        `Available exits: ${from.exits?.map((e) => e.direction).join(', ') || 'none'}`
                )
                return { status: 'error', reason: 'no-exit' } as const
            }

            console.debug(`[LocationRepository.move] Found exit: ${fromId} --${direction}--> ${exit.to}`)

            // Get destination location with detailed error logging
            let dest: Location | undefined
            try {
                dest = await this.get(exit.to)
            } catch (error) {
                console.error(`[LocationRepository.move] Error fetching destination location ${exit.to}:`, error)
                const errorMessage = error instanceof Error ? error.message : 'Unknown error'
                return { status: 'error', reason: `target-location-query-failed: ${errorMessage}` } as const
            }

            if (!dest) {
                console.error(
                    `[LocationRepository.move] Destination location not found: ${exit.to}. ` +
                        `This indicates a broken exit link in the graph.`
                )
                return { status: 'error', reason: 'target-missing' } as const
            }

            console.debug(`[LocationRepository.move] Move successful: ${fromId} --> ${dest.id} (${dest.name})`)
            return { status: 'ok', location: dest } as const
        } catch (error) {
            // Catch any unexpected errors (should be rare after specific error handling above)
            console.error(`[LocationRepository.move] Unexpected error during move operation:`, error)
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            return { status: 'error', reason: `unexpected-error: ${errorMessage}` } as const
        }
    }

    /** Upsert (idempotent) a location vertex. */
    async upsert(location: Location): Promise<{ created: boolean; id: string; updatedRevision?: number }> {
        // Input validation
        if (!location.id || !location.name || location.description === undefined) {
            const error = new Error('Location missing required fields (id, name, description)')
            this.telemetryService?.trackGameEventStrict('World.Location.Upsert', {
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
            const newContentHash = computeContentHash(location.name, location.description, location.tags)

            // First, check if the location exists to determine if this is create vs update
            const existingVertices = await this.queryWithTelemetry<Record<string, unknown>>(
                'location.upsert.check',
                'g.V(lid).valueMap(true)',
                { lid: location.id }
            )
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
                const existingContentHash = computeContentHash(existingName, existingDescription, existingTags)

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
                ver: newVersion
            }

            // Build the query: for tags, we need to add each tag individually (Cosmos Gremlin doesn't support array properties)
            let query =
                `g.V(lid).fold().coalesce(unfold(), addV('location').property('id', lid).property('${WORLD_GRAPH_PARTITION_KEY_PROP}', pk))` +
                ".property('name', name).property('description', desc).property('version', ver)"

            // Drop existing tags first if location has tags (to replace them)
            if (location.tags) {
                query = query + ".sideEffect(properties('tags').drop())"
            }

            // Add each tag as a separate property call
            if (location.tags && location.tags.length > 0) {
                for (let i = 0; i < location.tags.length; i++) {
                    bindings[`tag${i}`] = location.tags[i]
                    query = query + `.property('tags', tag${i})`
                }
            }

            await this.queryWithTelemetry('location.upsert.write', query, bindings)

            success = true
            updatedRevision = shouldIncrementRevision ? newVersion : undefined
            return { created, id: location.id, updatedRevision }
        } catch (error) {
            success = false
            reason = error instanceof Error ? error.message : 'Unknown error'
            throw error
        } finally {
            const latencyMs = Date.now() - startTime
            this.telemetryService?.trackGameEventStrict('World.Location.Upsert', {
                locationId: location.id,
                latencyMs,
                success,
                created: success ? created : undefined,
                revision: success ? updatedRevision : undefined,
                reason: success ? undefined : reason
            })
        }
    }

    /** Ensure an exit edge with direction exists between fromId and toId */
    async ensureExit(
        fromId: string,
        direction: string,
        toId: string,
        description?: string,
        opts?: { skipVertexCheck?: boolean; deferCacheRegen?: boolean }
    ): Promise<{ created: boolean }> {
        if (!isDirection(direction)) return { created: false }

        // Ensure both vertices exist (no-op if present) - skip if requested for bulk operations
        if (!opts?.skipVertexCheck) {
            await this.ensureVertex('location', fromId)
            await this.ensureVertex('location', toId)
        }

        // Check if edge already exists
        const existingEdges = await this.queryWithTelemetry<Record<string, unknown>>(
            'exit.ensureExit.check',
            "g.V(fid).outE('exit').has('direction', dir).where(inV().hasId(tid))",
            { fid: fromId, tid: toId, dir: direction }
        )

        if (existingEdges && existingEdges.length > 0) {
            // Edge already exists, not created
            return { created: false }
        }

        // Create new edge (use addE().from().to() pattern for Cosmos Gremlin)
        await this.queryWithTelemetry(
            'exit.ensureExit.create',
            "g.V(fid).addE('exit').to(g.V(tid)).property('direction', dir).property('description', desc)",
            {
                fid: fromId,
                tid: toId,
                dir: direction,
                desc: description || ''
            }
        )

        // Regenerate exits summary cache for the source location - defer if requested for bulk operations
        if (!opts?.deferCacheRegen) {
            await this.regenerateExitsSummaryCache(fromId)
        }

        // Emit telemetry for actual creation
        this.telemetryService?.trackGameEventStrict('World.Exit.Created', {
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
        const edges = await this.query<Record<string, unknown>>("g.V(fid).outE('exit').has('direction', dir)", {
            fid: fromId,
            dir: direction
        })

        if (!edges || edges.length === 0) {
            return { removed: false }
        }

        // Get destination for telemetry before removing
        const toLocationId = edges.length > 0 ? String((edges[0] as Record<string, unknown>).inV || '') : undefined

        // Drop the edges
        await this.query("g.V(fid).outE('exit').has('direction', dir).drop()", { fid: fromId, dir: direction })

        // Regenerate exits summary cache for the source location
        await this.regenerateExitsSummaryCache(fromId)

        // Emit telemetry for actual removal
        this.telemetryService?.trackGameEventStrict('World.Exit.Removed', {
            fromLocationId: fromId,
            dir: direction,
            toLocationId
        })

        return { removed: true }
    }

    /** Delete a location vertex and all its connected exit edges. */
    async deleteLocation(id: string): Promise<{ deleted: boolean }> {
        // Verify exists first
        const existing = await this.query<Record<string, unknown>>('g.V(lid).limit(1)', { lid: id })
        if (!existing || existing.length === 0) return { deleted: false }
        await this.query('g.V(lid).drop()', { lid: id })
        // Telemetry intentionally omitted to avoid cross-package event additions during consolidation
        return { deleted: true }
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
            await this.query("g.V(locationId).property('exitsSummaryCache', cache)", { locationId, cache })
            return { updated: true }
        } catch {
            return { updated: false }
        }
    }
}
