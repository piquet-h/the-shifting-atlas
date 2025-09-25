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

export const STARTER_ROOM_ID = 'starter-room'
export const SECOND_ROOM_ID = 'antechamber'
