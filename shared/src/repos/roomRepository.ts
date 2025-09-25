import {Room, SECOND_ROOM_ID, STARTER_ROOM_ID} from '../room.js'

// Repository contract isolates persistence (memory, cosmos, etc.) from handlers & AI tools.
export interface IRoomRepository {
    get(id: string): Promise<Room | undefined>
    move(fromId: string, direction: string): Promise<{status: 'ok'; room: Room} | {status: 'error'; reason: string}>
}

// In-memory implementation (Week 1). Mirrors prior roomStore logic.
class InMemoryRoomRepository implements IRoomRepository {
    private rooms: Map<string, Room>
    constructor() {
        this.rooms = new Map([
            [
                STARTER_ROOM_ID,
                {
                    id: STARTER_ROOM_ID,
                    name: 'Dusty Atrium',
                    description: 'A quiet stone atrium lit by a soft, sourceless glow. Faint motes drift in the still air.',
                    exits: [
                        {
                            direction: 'north',
                            to: SECOND_ROOM_ID,
                            description: 'A narrow archway chiseled into darker stone.'
                        }
                    ],
                    version: 1
                }
            ],
            [
                SECOND_ROOM_ID,
                {
                    id: SECOND_ROOM_ID,
                    name: 'Antechamber',
                    description: 'A low-ceilinged chamber with damp stone and a faint metallic echo. The atrium lies back to the south.',
                    exits: [{direction: 'south', to: STARTER_ROOM_ID, description: 'The archway back to the atrium.'}],
                    version: 1
                }
            ]
        ])
    }
    async get(id: string): Promise<Room | undefined> {
        return this.rooms.get(id)
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
