import {Direction} from '../domainModels.js'

/**
 * Simple in-memory store for player heading state.
 * This is a minimal implementation for N3 feature.
 * Future: integrate with full PlayerState persistence.
 */
class PlayerHeadingStore {
    private headings = new Map<string, Direction>()

    /**
     * Get the last heading for a player
     */
    getLastHeading(playerGuid: string): Direction | undefined {
        return this.headings.get(playerGuid)
    }

    /**
     * Update the last heading for a player after successful movement
     */
    setLastHeading(playerGuid: string, direction: Direction): void {
        this.headings.set(playerGuid, direction)
    }

    /**
     * Clear heading for a player (useful for testing)
     */
    clearHeading(playerGuid: string): void {
        this.headings.delete(playerGuid)
    }

    /**
     * Get all tracked player headings (useful for debugging)
     */
    getAllHeadings(): Record<string, Direction> {
        return Object.fromEntries(this.headings.entries())
    }
}

// Singleton instance for use across functions
let store: PlayerHeadingStore | undefined

export function getPlayerHeadingStore(): PlayerHeadingStore {
    if (!store) {
        store = new PlayerHeadingStore()
    }
    return store
}