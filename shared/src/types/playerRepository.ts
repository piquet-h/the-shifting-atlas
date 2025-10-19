/**
 * Player repository interface (implementation in backend package)
 * This interface is in shared to support auth module dependencies
 */

export interface PlayerRecord {
    id: string
    createdUtc: string
    /** ISO timestamp updated whenever mutable fields change. */
    updatedUtc?: string
    guest: boolean
    /** Optional federated / external identity mapping (e.g., Entra sub). */
    externalId?: string
    /** Bootstrap-assigned or user chosen display name (temporary). */
    name?: string
    /** Player's current location anchor (mirrors planned (player)-[:in]->(location) edge). */
    currentLocationId?: string
}

export interface IPlayerRepository {
    get(id: string): Promise<PlayerRecord | undefined>
    getOrCreate(id?: string): Promise<{ record: PlayerRecord; created: boolean }>
    linkExternalId(
        id: string,
        externalId: string
    ): Promise<{ updated: boolean; record?: PlayerRecord; conflict?: boolean; existingPlayerId?: string }>
    findByExternalId(externalId: string): Promise<PlayerRecord | undefined>
}
