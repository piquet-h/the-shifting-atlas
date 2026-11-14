import type { ExitAvailabilityMetadata } from './exitAvailability.js'
import type { TerrainType } from './domainModels.js'

/**
 * Lock state for an exit edge.
 *
 * - `locked`   — Exit exists and is wired, but movement is denied with a soft denial (400).
 *                The entrance narration should indicate it is locked. State can change via world events.
 * - `unlocked` — Exit is open for traversal (equivalent to absent/undefined).
 */
export type LockState = 'locked' | 'unlocked'

export interface LocationExit {
    direction: string
    to?: string
    description?: string
    /** Travel duration in milliseconds for this exit. Absent when not specified. */
    travelDurationMs?: number
    /**
     * Optional lock state for this exit.
     * When `'locked'`, movement through this exit returns a soft denial (400) instead of succeeding.
     * Absent or `'unlocked'` means the exit is open for traversal.
     * Lock state may be changed by world events.
     */
    lockState?: LockState
}

/** Default travel duration for exits within urban/settlement areas (5 minutes). */
export const URBAN_TRAVEL_DURATION_MS = 300_000

/**
 * Ground-distance scale of `the-long-reach.jpg` (`7040x8480` at 1:1,000,000, 100 m/px).
 * Used to convert between normalized `[0, 1]` Long Reach coordinates and ground meters.
 */
export const LONG_REACH_WIDTH_METERS = 704_000
export const LONG_REACH_HEIGHT_METERS = 848_000

/**
 * Normalized `[0, 1]` map coordinates on The Long Reach frame (`0,0` = top-left/NW, `1,1` = bottom-right/SE).
 */
export interface MapPosition {
    x: number
    y: number
}

export function isValidMapPosition(value: unknown): value is MapPosition {
    if (!value || typeof value !== 'object') return false
    const candidate = value as Record<string, unknown>
    return (
        typeof candidate.x === 'number' &&
        Number.isFinite(candidate.x) &&
        candidate.x >= 0 &&
        candidate.x <= 1 &&
        typeof candidate.y === 'number' &&
        Number.isFinite(candidate.y) &&
        candidate.y >= 0 &&
        candidate.y <= 1
    )
}

export function distanceBetweenMapPositionsMeters(a: MapPosition, b: MapPosition): number {
    const dxMeters = (b.x - a.x) * LONG_REACH_WIDTH_METERS
    const dyMeters = (b.y - a.y) * LONG_REACH_HEIGHT_METERS
    return Math.hypot(dxMeters, dyMeters)
}

export interface Location {
    id: string
    name: string
    description: string
    /** Terrain type for spatial generation guidance (optional for backward compatibility) */
    terrain?: TerrainType
    /** Optional normalized `[0, 1]` Long Reach map coordinates for authoring overlays and terrain-guided expansion. */
    mapPosition?: MapPosition
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
