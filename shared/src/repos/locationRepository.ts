import starterLocationsData from '../data/villageLocations.json' with {type: 'json'}
import {isDirection} from '../domainModels.js'
import {createGremlinClient} from '../gremlin/gremlinClient.js'
import {Location} from '../location.js'
import {loadPersistenceConfig, resolvePersistenceMode} from '../persistenceConfig.js'
import {CosmosLocationRepository} from './locationRepository.cosmos.js'

// Repository contract isolates persistence (memory, cosmos, etc.) from handlers & AI tools.
export interface ILocationRepository {
    get(id: string): Promise<Location | undefined>
    move(fromId: string, direction: string): Promise<{status: 'ok'; location: Location} | {status: 'error'; reason: string}>
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
        if (!isDirection(direction)) return {status: 'error', reason: 'no-exit'} as const
        const from = this.locations.get(fromId)
        if (!from) return {status: 'error', reason: 'from-missing'} as const
        const exit = from.exits?.find((e) => e.direction === direction)
        if (!exit || !exit.to) return {status: 'error', reason: 'no-exit'} as const
        const dest = this.locations.get(exit.to)
        if (!dest) return {status: 'error', reason: 'target-missing'} as const
        return {status: 'ok', location: dest} as const
    }
}

let singleton: ILocationRepository | undefined
export function getLocationRepository(): ILocationRepository {
    if (singleton) return singleton
    const mode = resolvePersistenceMode()
    if (mode === 'cosmos') {
        try {
            const cfg = loadPersistenceConfig()
            if (cfg.mode === 'cosmos' && cfg.cosmos) {
                const pending = createGremlinClient(cfg.cosmos)
                // Proxy defers actual repository instantiation until first call completes.
                const proxy: ILocationRepository = {
                    async get(id: string) {
                        const repo = new CosmosLocationRepository(await pending)
                        return repo.get(id)
                    },
                    async move(fromId: string, direction: string) {
                        const repo = new CosmosLocationRepository(await pending)
                        return repo.move(fromId, direction)
                    }
                }
                singleton = proxy
                return singleton
            }
        } catch {
            // fall back silently
        }
    }
    singleton = new InMemoryLocationRepository()
    return singleton
}

export function __resetLocationRepositoryForTests() {
    singleton = undefined
}
