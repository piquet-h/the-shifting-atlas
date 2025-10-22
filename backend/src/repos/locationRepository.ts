import { getOppositeDirection, isDirection, Location } from '@piquet-h/shared'
import starterLocationsData from '../data/villageLocations.json' with { type: 'json' }
import { createGremlinClient } from '../gremlin/gremlinClient.js'
import { loadPersistenceConfigAsync, resolvePersistenceMode } from '../persistenceConfig.js'
import { CosmosLocationRepository } from './locationRepository.cosmos.js'

// Repository contract isolates persistence (memory, cosmos, etc.) from handlers & AI tools.
export interface ILocationRepository {
    get(id: string): Promise<Location | undefined>
    move(fromId: string, direction: string): Promise<{ status: 'ok'; location: Location } | { status: 'error'; reason: string }>
    /** Upsert (idempotent) a location vertex. Returns whether a new vertex was created and updated revision (if changed). */
    upsert(location: Location): Promise<{ created: boolean; id: string; updatedRevision?: number }>
    /** Ensure an exit edge between two locations. Returns whether a new edge was created. */
    ensureExit(fromId: string, direction: string, toId: string, description?: string): Promise<{ created: boolean }>
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
}

// In-memory implementation seeded from plain JSON world seed. Swap with
// a Cosmos/Gremlin implementation in future without changing handler code.
class InMemoryLocationRepository implements ILocationRepository {
    private locations: Map<string, Location>
    constructor() {
        const locs = starterLocationsData as Location[]
        this.locations = new Map(locs.map((r) => [r.id, r]))
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
            const existingHash = this.computeContentHash(existing.name, existing.description, existing.tags)
            const newHash = this.computeContentHash(location.name, location.description, location.tags)

            // Only update version if content changed
            const contentChanged = existingHash !== newHash
            const newVersion = contentChanged ? (existing.version || 0) + 1 : existing.version

            // Shallow update (keep existing exits unless provided)
            this.locations.set(location.id, {
                ...existing,
                name: location.name ?? existing.name,
                description: location.description ?? existing.description,
                exits: location.exits || existing.exits,
                version: newVersion ?? location.version
            })
            return { created: false, id: location.id, updatedRevision: contentChanged ? newVersion : undefined }
        }
        this.locations.set(location.id, { ...location, exits: location.exits || [], version: location.version || 1 })
        return { created: true, id: location.id, updatedRevision: location.version || 1 }
    }

    private computeContentHash(name: string, description: string, tags?: string[]): string {
        const sortedTags = tags && tags.length > 0 ? [...tags].sort() : []
        const content = JSON.stringify({ name, description, tags: sortedTags })
        // Simple hash for in-memory (doesn't need crypto strength)
        let hash = 0
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i)
            hash = (hash << 5) - hash + char
            hash = hash & hash // Convert to 32bit integer
        }
        return hash.toString(36)
    }
    async ensureExit(fromId: string, direction: string, toId: string, description?: string) {
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
}

let singleton: ILocationRepository | undefined
export async function getLocationRepository(): Promise<ILocationRepository> {
    if (singleton) return singleton
    const mode = resolvePersistenceMode()
    if (mode === 'cosmos') {
        const strict =
            typeof process !== 'undefined' && (process.env.PERSISTENCE_STRICT === '1' || process.env.PERSISTENCE_STRICT === 'true')
        try {
            const cfg = await loadPersistenceConfigAsync()
            if (cfg.mode === 'cosmos' && cfg.cosmos) {
                const pending = createGremlinClient(cfg.cosmos)
                const proxy: ILocationRepository = {
                    async get(id: string) {
                        const repo = new CosmosLocationRepository(await pending)
                        return repo.get(id)
                    },
                    async move(fromId: string, direction: string) {
                        const repo = new CosmosLocationRepository(await pending)
                        return repo.move(fromId, direction)
                    },
                    async upsert(location) {
                        const repo = new CosmosLocationRepository(await pending)
                        return repo.upsert(location)
                    },
                    async ensureExit(fromId, direction, toId, description) {
                        const repo = new CosmosLocationRepository(await pending)
                        return repo.ensureExit(fromId, direction, toId, description)
                    },
                    async ensureExitBidirectional(fromId, direction, toId, opts) {
                        const repo = new CosmosLocationRepository(await pending)
                        return repo.ensureExitBidirectional(fromId, direction, toId, opts)
                    },
                    async removeExit(fromId, direction) {
                        const repo = new CosmosLocationRepository(await pending)
                        return repo.removeExit(fromId, direction)
                    },
                    async applyExits(exits) {
                        const repo = new CosmosLocationRepository(await pending)
                        return repo.applyExits(exits)
                    },
                    async updateExitsSummaryCache(locationId, cache) {
                        const repo = new CosmosLocationRepository(await pending)
                        return repo.updateExitsSummaryCache(locationId, cache)
                    }
                }
                singleton = proxy
                return singleton
            }
        } catch (err) {
            if (strict) {
                throw err instanceof Error ? err : new Error('Cosmos repository initialization failed in strict mode.')
            }
            // non-strict: silently fall back
        }
    }
    singleton = new InMemoryLocationRepository()
    return singleton
}

export function __resetLocationRepositoryForTests() {
    singleton = undefined
}
