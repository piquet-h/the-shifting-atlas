export interface RoomExit {
    direction: string
    to?: string
    description?: string
}

export interface Room {
    id: string
    name: string
    description: string
    exits?: RoomExit[]
    version?: number
}

// NOTE: Replaced legacy human-readable ids with stable UUIDv4 values to allow
// effectively unbounded future expansion without early namespace collisions.
// Previous values: 'starter-room', 'antechamber'.
export const STARTER_ROOM_ID = 'a4d1c3f1-5b2a-4f7d-9d4b-8f0c2a6b7e21'
export const SECOND_ROOM_ID = 'f7c9b2ad-1e34-4c6f-8d5a-2b7e9c4f1a53'
