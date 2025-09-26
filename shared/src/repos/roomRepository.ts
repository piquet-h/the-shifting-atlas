import villageRoomsData from '../data/villageRooms.json' assert {type: 'json'}
import {Room, SECOND_ROOM_ID, STARTER_ROOM_ID} from '../room.js'

// Legacy human-readable ids (pre-UUID migration) mapped to current UUIDs. This allows
// older cached client state (sessionStorage/localStorage, bookmarks, etc.) to continue
// functioning after the UUID transition without 404s. Remove once no longer observed
// in telemetry (e.g. after a deprecation window).
const LEGACY_ROOM_ID_ALIASES: Record<string, string> = {
    'starter-room': STARTER_ROOM_ID,
    antechamber: SECOND_ROOM_ID,
    'north-gate': '3b0f5c88-6f27-4f0e-946d-3bdc4d7f9a11',
    'old-shrine': '6e2d9a5b-8c3e-4b1a-b0f1-92d3c6e4f8d2',
    'tavern-common-room': '9c4b1f2e-5d6a-4e3b-8a7c-1d2f3e4a5b6c',
    'blacksmith-forge': '2f1d7c9e-3b4a-45d8-9e6f-7a1c2b3d4e5f',
    'trading-post': '7a6d5c4b-3e2f-41a9-8b7c-9d0e1f2a3b4c',
    'herbalist-garden': '5e4d3c2b-1a0f-4b9e-8c7d-6a5b4c3d2e1f',
    'manor-house': '8b7c6d5e-4f3a-42b1-9c8d-7e6f5a4b3c2d',
    'west-farm': '4c3b2a1f-0e9d-48c7-b6a5-5d4e3f2a1b0c',
    'south-road': 'e1f2d3c4-b5a6-47e8-9f0a-1b2c3d4e5f6a',
    'south-farm': 'd0c9b8a7-6e5f-41d2-8c3b-2a1f0e9d8c7b',
    'east-farm': 'a9b8c7d6-e5f4-43a2-9b1c-0d2e3f4a5b6c'
}

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
        // Direct lookup first
        let room = this.rooms.get(id)
        if (room) return room
        // Legacy alias resolution (slug -> UUID)
        const aliased = LEGACY_ROOM_ID_ALIASES[id]
        if (aliased) {
            room = this.rooms.get(aliased)
            if (room) return room
        }
        // Reverse scenario: running process seeded with pre-migration JSON (should not happen
        // after code update) — attempt reverse mapping so new UUID queries still succeed.
        const reverse = Object.entries(LEGACY_ROOM_ID_ALIASES).find(([, v]) => v === id)
        if (reverse) {
            const legacyRoom = this.rooms.get(reverse[0])
            if (legacyRoom) return {...legacyRoom, id} // clone with modern id so callers see canonical id
        }
        return undefined
    }
    async move(fromId: string, direction: string) {
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
    if (!singleton) singleton = new InMemoryRoomRepository()
    return singleton
}

export function __resetRoomRepositoryForTests() {
    singleton = undefined
}
