import starterLocationsData from '../data/villageLocations.json' with { type: 'json' }
import { isDirection } from '../domainModels.js'
import { createGremlinClient } from '../gremlin/gremlinClient.js'
import { Location } from '../location.js'
import { loadPersistenceConfig, resolvePersistenceMode } from '../persistenceConfig.js'
import { CosmosLocationRepository } from './locationRepository.cosmos.js'

// Repository contract isolates persistence (memory, cosmos, etc.) from handlers & AI tools.
export interface ILocationRepository {
    get(id: string): Promise<Location | undefined>
    move(fromId: string, direction: string): Promise<{ status: 'ok'; location: Location } | { status: 'error'; reason: string }>
    /** Upsert (idempotent) a location vertex. Returns whether a new vertex was created. */
    upsert(location: Location): Promise<{ created: boolean; id: string }>
    /** Ensure an exit edge between two locations. Returns whether a new edge was created. */
    ensureExit(fromId: string, direction: string, toId: string, description?: string): Promise<{ created: boolean }>
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
            // Shallow update (keep existing exits unless provided)
            this.locations.set(location.id, {
                ...existing,
                name: location.name ?? existing.name,
                description: location.description ?? existing.description,
                exits: location.exits || existing.exits,
                version: location.version ?? existing.version
            })
            return { created: false, id: location.id }
        }
        this.locations.set(location.id, { ...location, exits: location.exits || [] })
        return { created: true, id: location.id }
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
}

let singleton: ILocationRepository | undefined
export function getLocationRepository(): ILocationRepository {
    if (singleton) return singleton
    const mode = resolvePersistenceMode()
    if (mode === 'cosmos') {
        const strict =
            typeof process !== 'undefined' && (process.env.PERSISTENCE_STRICT === '1' || process.env.PERSISTENCE_STRICT === 'true')
        try {
            const cfg = loadPersistenceConfig()
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
