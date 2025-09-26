import villageRoomsData from '../data/villageRooms.json' with {type: 'json'}
import {isDirection} from '../domainModels.js'
import {createGremlinClient} from '../gremlin/gremlinClient.js'
import {loadPersistenceConfig, resolvePersistenceMode} from '../persistenceConfig.js'
import {Room} from '../room.js'
import {CosmosRoomRepository} from './roomRepository.cosmos.js'

// Repository contract isolates persistence (memory, cosmos, etc.) from handlers & AI tools.
export interface IRoomRepository {
    get(id: string): Promise<Room | undefined>
    move(fromId: string, direction: string): Promise<{status: 'ok'; room: Room} | {status: 'error'; reason: string}>
}

// In-memory implementation seeded from plain JSON (villageRooms.json). Swap with
// a Cosmos/Gremlin implementation in future without changing handler code.
class InMemoryRoomRepository implements IRoomRepository {
    private rooms: Map<string, Room>
    constructor() {
        const villageRooms = villageRoomsData as Room[]
        this.rooms = new Map(villageRooms.map((r) => [r.id, r]))
    }
    async get(id: string): Promise<Room | undefined> {
        // Legacy slug alias support removed (post-deprecation window). Only direct UUID lookup remains.
        return this.rooms.get(id)
    }
    async move(fromId: string, direction: string) {
        if (!isDirection(direction)) return {status: 'error', reason: 'no-exit'} as const
        const from = this.rooms.get(fromId)
        if (!from) return {status: 'error', reason: 'from-missing'} as const
        const exit = from.exits?.find((e) => e.direction === direction)
        if (!exit || !exit.to) return {status: 'error', reason: 'no-exit'} as const
        const dest = this.rooms.get(exit.to)
        if (!dest) return {status: 'error', reason: 'target-missing'} as const
        return {status: 'ok', room: dest} as const
    }
}

let singleton: IRoomRepository | undefined
export function getRoomRepository(): IRoomRepository {
    if (singleton) return singleton
    const mode = resolvePersistenceMode()
    if (mode === 'cosmos') {
        try {
            const cfg = loadPersistenceConfig()
            if (cfg.mode === 'cosmos' && cfg.cosmos) {
                const pending = createGremlinClient(cfg.cosmos)
                // Proxy defers actual repository instantiation until first call completes.
                const proxy: IRoomRepository = {
                    async get(id: string) {
                        const repo = new CosmosRoomRepository(await pending)
                        return repo.get(id)
                    },
                    async move(fromId: string, direction: string) {
                        const repo = new CosmosRoomRepository(await pending)
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
    singleton = new InMemoryRoomRepository()
    return singleton
}

export function __resetRoomRepositoryForTests() {
    singleton = undefined
}
