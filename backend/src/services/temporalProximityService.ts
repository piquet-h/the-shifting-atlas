/**
 * Temporal Proximity Service
 *
 * Graph-based (BFS/Dijkstra) service for finding locations reachable within a travel-time
 * threshold via existing exit edges. Supports strict urban reconnection (loop closure) and
 * bounded wilderness stitching without coordinate-based spatial indexing.
 *
 * Design: single implementation over IExitRepository + ILocationRepository abstractions,
 * compatible with both memory (tests) and Cosmos/Gremlin (production) modes.
 */

import { inject, injectable } from 'inversify'
import type { IExitRepository } from '../repos/exitRepository.js'
import type { ILocationRepository } from '../repos/locationRepository.js'

/**
 * Default travel duration fallback when an exit edge has no travelDurationMs.
 * Matches ActionRegistry 'move' base duration (1 minute).
 */
const DEFAULT_TRAVEL_DURATION_MS = 60_000

/**
 * A location reachable from the source within a travel-time budget.
 */
export interface ProximityCandidate {
    /** Destination location ID. */
    locationId: string
    /** Accumulated travel time from source (milliseconds). */
    accumulatedTravelMs: number
    /** Number of exit-edge hops from source. */
    hops: number
    /** Direction of the first hop from source along the selected shortest path. */
    firstHopDirection?: string
    /** Travel-weighted X displacement for the selected shortest path. */
    displacementX?: number
    /** Travel-weighted Y displacement for the selected shortest path. */
    displacementY?: number
}

const DIRECTION_VECTORS: Readonly<Record<string, { x: number; y: number }>> = {
    north: { x: 0, y: 1 },
    south: { x: 0, y: -1 },
    east: { x: 1, y: 0 },
    west: { x: -1, y: 0 },
    northeast: { x: 1, y: 1 },
    northwest: { x: -1, y: 1 },
    southeast: { x: 1, y: -1 },
    southwest: { x: -1, y: -1 },
    up: { x: 0, y: 0 },
    down: { x: 0, y: 0 },
    in: { x: 0, y: 0 },
    out: { x: 0, y: 0 }
}

/**
 * Service interface for graph-based temporal proximity queries.
 */
export interface ITemporalProximityService {
    /**
     * Find all locations reachable from `fromLocationId` within `maxTravelMs` via exit edges.
     * Uses Dijkstra-style traversal with per-edge `travelDurationMs` (falls back to
     * DEFAULT_TRAVEL_DURATION_MS when absent). Dangling exits (target not in repository)
     * are silently skipped.
     *
     * @param fromLocationId - Source location ID.
     * @param maxTravelMs    - Maximum accumulated travel time (inclusive).
     * @param realmKey       - Optional realm tag; when provided, only locations whose
     *                         `tags` include this value are returned (cross-realm guard).
     * @returns Candidates ordered by accumulatedTravelMs ascending, then locationId
     *          lexicographically for ties.
     */
    findWithinTravelTime(fromLocationId: string, maxTravelMs: number, realmKey?: string): Promise<ProximityCandidate[]>

    /**
     * Check whether following the exit in `direction` from `fromLocationId` lands at a
     * known (non-dangling) location.  Used for strict loop-closure checks during world
     * stitching (e.g., "does the end of this street connect back to an existing location?").
     *
     * @param fromLocationId - Source location ID.
     * @param direction      - Exit direction to follow.
     * @param travelMs       - Expected travel duration of the reconnection (informational;
     *                         carried for callers that need to compare against the stored edge).
     * @returns `{ found: true, locationId }` when the exit exists and its target is live,
     *          `{ found: false }` otherwise.
     */
    checkDirectReconnection(fromLocationId: string, direction: string, travelMs: number): Promise<{ found: boolean; locationId?: string }>
}

/**
 * Single implementation of ITemporalProximityService that works in all persistence
 * modes (memory for tests, Cosmos/Gremlin for production) by relying solely on the
 * IExitRepository and ILocationRepository abstractions.
 */
@injectable()
export class TemporalProximityService implements ITemporalProximityService {
    constructor(
        @inject('IExitRepository') private readonly exitRepository: IExitRepository,
        @inject('ILocationRepository') private readonly locationRepository: ILocationRepository
    ) {}

    async findWithinTravelTime(fromLocationId: string, maxTravelMs: number, realmKey?: string): Promise<ProximityCandidate[]> {
        // Dijkstra over exit edges — ensures each node is reached via the shortest path.
        // bestCost: locationId → lowest accumulated travel ms found so far.
        const bestCost = new Map<string, number>()
        const bestHops = new Map<string, number>()

        // Unvisited set with their current best cost; we process cheapest first.
        // For small graphs (bounded by maxTravelMs) a sorted array is sufficient.
        interface Entry {
            locationId: string
            accumulatedMs: number
            hops: number
            firstHopDirection?: string
            displacementX: number
            displacementY: number
        }
        const frontier: Entry[] = [{ locationId: fromLocationId, accumulatedMs: 0, hops: 0, displacementX: 0, displacementY: 0 }]
        bestCost.set(fromLocationId, 0)
        bestHops.set(fromLocationId, 0)
        const bestFirstHopDirection = new Map<string, string | undefined>()
        bestFirstHopDirection.set(fromLocationId, undefined)
        const bestDisplacement = new Map<string, { x: number; y: number }>()
        bestDisplacement.set(fromLocationId, { x: 0, y: 0 })

        while (frontier.length > 0) {
            // Pop the entry with lowest accumulated cost (Dijkstra front).
            frontier.sort((a, b) => a.accumulatedMs - b.accumulatedMs)
            const current = frontier.shift()!

            // Skip stale entries (a shorter path was found after this was enqueued).
            if (current.accumulatedMs > (bestCost.get(current.locationId) ?? Infinity)) {
                continue
            }

            const exits = await this.exitRepository.getExits(current.locationId)

            for (const exit of exits) {
                if (!exit.toLocationId) continue

                const stepMs = exit.travelDurationMs ?? DEFAULT_TRAVEL_DURATION_MS
                const newCost = current.accumulatedMs + stepMs

                if (newCost > maxTravelMs) continue

                const existingCost = bestCost.get(exit.toLocationId)
                if (existingCost !== undefined && existingCost <= newCost) continue

                // Verify the destination exists (skip dangling exits).
                const location = await this.locationRepository.get(exit.toLocationId)
                if (!location) continue

                // Realm guard: skip if location's tags don't include the requested realm key.
                if (realmKey && !location.tags?.includes(realmKey)) continue

                bestCost.set(exit.toLocationId, newCost)
                bestHops.set(exit.toLocationId, current.hops + 1)
                const firstHopDirection = current.hops === 0 ? exit.direction : current.firstHopDirection
                const vector = DIRECTION_VECTORS[exit.direction] || { x: 0, y: 0 }
                const nextDisplacementX = current.displacementX + vector.x * stepMs
                const nextDisplacementY = current.displacementY + vector.y * stepMs
                bestFirstHopDirection.set(exit.toLocationId, firstHopDirection)
                bestDisplacement.set(exit.toLocationId, { x: nextDisplacementX, y: nextDisplacementY })
                frontier.push({
                    locationId: exit.toLocationId,
                    accumulatedMs: newCost,
                    hops: current.hops + 1,
                    firstHopDirection,
                    displacementX: nextDisplacementX,
                    displacementY: nextDisplacementY
                })
            }
        }

        // Collect candidates, excluding the source itself.
        const candidates: ProximityCandidate[] = []
        for (const [locationId, accumulatedTravelMs] of bestCost) {
            if (locationId === fromLocationId) continue
            candidates.push({
                locationId,
                accumulatedTravelMs,
                hops: bestHops.get(locationId) ?? 0,
                firstHopDirection: bestFirstHopDirection.get(locationId),
                displacementX: bestDisplacement.get(locationId)?.x,
                displacementY: bestDisplacement.get(locationId)?.y
            })
        }

        // Primary sort: ascending accumulatedTravelMs; secondary: lexicographic locationId.
        return candidates.sort((a, b) =>
            a.accumulatedTravelMs !== b.accumulatedTravelMs
                ? a.accumulatedTravelMs - b.accumulatedTravelMs
                : a.locationId.localeCompare(b.locationId)
        )
    }

    async checkDirectReconnection(
        fromLocationId: string,
        direction: string,
        // travelMs is part of the contract for callers that need to validate the stored edge duration;
        // the basic implementation checks existence only.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _travelMs: number
    ): Promise<{ found: boolean; locationId?: string }> {
        const exits = await this.exitRepository.getExits(fromLocationId)
        const exit = exits.find((e) => e.direction === direction)

        if (!exit?.toLocationId) return { found: false }

        const location = await this.locationRepository.get(exit.toLocationId)
        if (!location) return { found: false }

        return { found: true, locationId: exit.toLocationId }
    }
}
