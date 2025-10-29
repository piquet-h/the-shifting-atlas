import { Direction, ExitEdge, generateExitsSummary, getOppositeDirection, isDirection, Location } from '@piquet-h/shared'
import { injectable } from 'inversify'
import starterLocationsData from '../data/villageLocations.json' with { type: 'json' }
import { ExitEdgeResult, IExitRepository, sortExits } from './exitRepository.js'
import { computeContentHash } from './utils/index.js'

// Repository contract isolates persistence (memory, cosmos, etc.) from handlers & AI tools.
export interface ILocationRepository {
    get(id: string): Promise<Location | undefined>
    move(fromId: string, direction: string): Promise<{ status: 'ok'; location: Location } | { status: 'error'; reason: string }>
    /** Upsert (idempotent) a location vertex. Returns whether a new vertex was created and updated revision (if changed). */
    upsert(location: Location): Promise<{ created: boolean; id: string; updatedRevision?: number }>
    /** Ensure an exit edge between two locations. Returns whether a new edge was created. */
    ensureExit(
        fromId: string,
        direction: string,
        toId: string,
        description?: string,
        opts?: { skipVertexCheck?: boolean; deferCacheRegen?: boolean }
    ): Promise<{ created: boolean }>
    /** Ensure an exit edge with optional bidirectional creation. Returns creation status for both directions. */
    ensureExitBidirectional(
        fromId: string,
        direction: string,
        toId: string,
        opts?: { reciprocal?: boolean; description?: string; reciprocalDescription?: string }
    ): Promise<{ created: boolean; reciprocalCreated?: boolean }>
    /** Remove an exit edge. Returns whether an edge was actually removed. */
    removeExit(fromId: string, direction: string): Promise<{ removed: boolean }>
    /** Batch apply multiple exits. Returns summary metrics. */
    applyExits(exits: Array<{ fromId: string; direction: string; toId: string; description?: string; reciprocal?: boolean }>): Promise<{
        exitsCreated: number
        exitsSkipped: number
        reciprocalApplied: number
    }>
    /** Update the exits summary cache for a location. Returns whether the cache was updated. */
    updateExitsSummaryCache(locationId: string, cache: string): Promise<{ updated: boolean }>
    /** Regenerate exits summary cache for a location (bulk operations). */
    regenerateExitsSummaryCache(locationId: string): Promise<void>
}

// In-memory implementation seeded from plain JSON world seed. Swap with
// a Cosmos/Gremlin implementation in future without changing handler code.
// Implements both ILocationRepository and IExitRepository since exits are stored
// as nested properties of locations in memory.
@injectable()
export class InMemoryLocationRepository implements ILocationRepository, IExitRepository {
    private locations: Map<string, Location>
    constructor() {
        const locs = starterLocationsData as Location[]
        this.locations = new Map(locs.map((r) => [r.id, r]))
    }

    /** Helper: Regenerate exits summary cache for a location */
    async regenerateExitsSummaryCache(locationId: string): Promise<void> {
        const location = this.locations.get(locationId)
        if (!location) return

        // Convert Location exits to ExitEdge format
        const exits: ExitEdge[] =
            location.exits?.map((e) => ({
                fromLocationId: locationId,
                toLocationId: e.to || '',
                direction: e.direction as Direction,
                description: e.description
            })) || []

        // Generate and update cache
        location.exitsSummaryCache = generateExitsSummary(exits)
    }

    /** Helper: Sort location exits using canonical exit ordering */
    private sortLocationExits(
        exits: Array<{ direction: string; to?: string; description?: string }>
    ): Array<{ direction: string; to?: string; description?: string }> {
        // Convert to ExitEdgeResult format for sorting
        const exitResults: ExitEdgeResult[] = exits.map((e) => ({
            direction: e.direction as Direction,
            toLocationId: e.to || '',
            description: e.description
        }))

        // Sort using canonical ordering
        const sorted = sortExits(exitResults)

        // Convert back to location exit format
        return sorted.map((e) => ({
            direction: e.direction,
            to: e.toLocationId,
            description: e.description
        }))
    }

    async get(id: string): Promise<Location | undefined> {
        return this.locations.get(id)
    }
    async move(fromId: string, direction: string) {
        if (!isDirection(direction)) return { status: 'error', reason: 'no-exit' } as const
        const from = this.locations.get(fromId)
        if (!from) return { status: 'error', reason: 'from-missing' } as const
        const exit = from.exits?.find((e) => e.direction === direction)
        if (!exit || !exit.to) return { status: 'error', reason: 'no-exit' } as const
        const dest = this.locations.get(exit.to)
        if (!dest) return { status: 'error', reason: 'target-missing' } as const
        return { status: 'ok', location: dest } as const
    }
    async upsert(location: Location) {
        const existing = this.locations.get(location.id)
        if (existing) {
            // Compute content hash for comparison
            const existingHash = computeContentHash(existing.name, existing.description, existing.tags)
            const newHash = computeContentHash(location.name, location.description, location.tags)

            // Only update version if content changed
            const contentChanged = existingHash !== newHash
            const newVersion = contentChanged ? (existing.version || 0) + 1 : existing.version

            // Sort exits if provided, maintaining canonical order
            const sortedExits = location.exits ? this.sortLocationExits(location.exits) : existing.exits

            // Shallow update (keep existing exits unless provided)
            this.locations.set(location.id, {
                ...existing,
                name: location.name ?? existing.name,
                description: location.description ?? existing.description,
                exits: sortedExits,
                version: newVersion ?? location.version
            })
            return { created: false, id: location.id, updatedRevision: contentChanged ? newVersion : undefined }
        }

        // Sort exits for new locations
        const sortedExits = location.exits ? this.sortLocationExits(location.exits) : []
        this.locations.set(location.id, { ...location, exits: sortedExits, version: location.version || 1 })
        return { created: true, id: location.id, updatedRevision: location.version || 1 }
    }

    async ensureExit(
        fromId: string,
        direction: string,
        toId: string,
        description?: string,
        opts?: { skipVertexCheck?: boolean; deferCacheRegen?: boolean }
    ) {
        if (!isDirection(direction)) return { created: false }
        const from = this.locations.get(fromId)
        const to = this.locations.get(toId)
        if (!from || !to) return { created: false }
        if (!from.exits) from.exits = []
        const existing = from.exits.find((e) => e.direction === direction && e.to === toId)
        if (existing) {
            // Optionally refresh description
            if (description && !existing.description) existing.description = description
            return { created: false }
        }
        from.exits.push({ direction, to: toId, description })
        // Sort exits after adding new one
        from.exits = this.sortLocationExits(from.exits)
        // Regenerate exits summary cache (unless deferred for bulk operations)
        if (!opts?.deferCacheRegen) {
            await this.regenerateExitsSummaryCache(fromId)
        }
        return { created: true }
    }

    async ensureExitBidirectional(
        fromId: string,
        direction: string,
        toId: string,
        opts?: { reciprocal?: boolean; description?: string; reciprocalDescription?: string }
    ) {
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

    async removeExit(fromId: string, direction: string) {
        if (!isDirection(direction)) return { removed: false }
        const from = this.locations.get(fromId)
        if (!from || !from.exits) return { removed: false }
        const initialLength = from.exits.length
        from.exits = from.exits.filter((e) => !(e.direction === direction))
        const removed = from.exits.length < initialLength
        if (removed) {
            // Regenerate exits summary cache
            await this.regenerateExitsSummaryCache(fromId)
        }
        return { removed }
    }

    async applyExits(exits: Array<{ fromId: string; direction: string; toId: string; description?: string; reciprocal?: boolean }>) {
        let exitsCreated = 0
        let exitsSkipped = 0
        let reciprocalApplied = 0

        for (const exit of exits) {
            const result = await this.ensureExitBidirectional(exit.fromId, exit.direction, exit.toId, {
                reciprocal: exit.reciprocal,
                description: exit.description
            })
            if (result.created) exitsCreated++
            else exitsSkipped++
            if ('reciprocalCreated' in result && result.reciprocalCreated) reciprocalApplied++
        }

        return { exitsCreated, exitsSkipped, reciprocalApplied }
    }

    async updateExitsSummaryCache(locationId: string, cache: string) {
        const location = this.locations.get(locationId)
        if (!location) return { updated: false }
        location.exitsSummaryCache = cache
        return { updated: true }
    }

    // IExitRepository implementation
    async getExits(locationId: string): Promise<ExitEdgeResult[]> {
        const location = await this.get(locationId)
        if (!location || !location.exits) {
            return []
        }

        // Convert location exits to ExitEdgeResult format
        const exits: ExitEdgeResult[] = location.exits.map((exit) => ({
            direction: exit.direction as Direction,
            toLocationId: exit.to || '',
            description: exit.description
        }))

        return sortExits(exits)
    }
}
