// Shared Room domain type (pre-persistence stub)
// Minimal shape to unblock early traversal & content loop.
export interface RoomExit {
    direction: string // e.g. 'north', 'south'
    to?: string // target room id (undefined if not yet generated)
    description?: string // optional flavor text for the exit
}

export interface Room {
    id: string
    name: string
    description: string
    exits?: RoomExit[]
    version?: number
}

export const STARTER_ROOM_ID = 'starter-room'
export const SECOND_ROOM_ID = 'antechamber'
