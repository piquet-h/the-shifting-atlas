import type { Direction } from './domainModels.js'
import type { ExitAvailabilityMetadata } from './exitAvailability.js'

export interface LocationExit {
    direction: string
    to?: string
    description?: string
}

export interface Location {
    id: string
    name: string
    description: string
    exits?: LocationExit[]
    /** Optional semantic / facet tags (e.g., 'settlement:mosswell', 'shop:smithy'). */
    tags?: string[]
    version?: number
    /** Cached human-readable summary of exits (regenerated when exits change). */
    exitsSummaryCache?: string
    /** Exit availability metadata: tracks which directions are pending generation or permanently forbidden. */
    exitAvailability?: ExitAvailabilityMetadata
}

// Stable UUIDv4 seed location identifiers (formerly STARTER_ROOM_ID / SECOND_ROOM_ID).
// These act as anchor points for early traversal and testing. They intentionally have
// no semantic slug component so future world expansion (dungeons, biomes, structures)
// is not constrained by early naming choices.
export const STARTER_LOCATION_ID = 'a4d1c3f1-5b2a-4f7d-9d4b-8f0c2a6b7e21'
export const SECOND_LOCATION_ID = 'f7c9b2ad-1e34-4c6f-8d5a-2b7e9c4f1a53'
