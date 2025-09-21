import {Room, SECOND_ROOM_ID, STARTER_ROOM_ID} from '@atlas/shared'

// Simple in-memory store with two static rooms. Later replace with persistence adapter.
class InMemoryRoomStore {
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

    get(id: string): Room | undefined {
        return this.rooms.get(id)
    }
}

export const roomStore = new InMemoryRoomStore()
