import { Direction } from '@piquet-h/shared'
import { inject, injectable } from 'inversify'
import type { IGremlinClient } from '../gremlin/gremlinClient.js'

/** Exit edge representation from Gremlin query */
export interface ExitEdgeResult {
    direction: Direction
    toLocationId: string
    description?: string
    kind?: string
    state?: string
}

/** Ordered exit categories for canonical display */
const EXIT_ORDER: Record<string, number> = {
    // Compass (cardinal + diagonal)
    north: 0,
    south: 1,
    east: 2,
    west: 3,
    northeast: 4,
    northwest: 5,
    southeast: 6,
    southwest: 7,
    // Vertical
    up: 8,
    down: 9,
    // Radial
    in: 10,
    out: 11
}

/**
 * Sort exits by canonical order: compass → vertical → radial → semantic (alphabetical).
 * Semantic exits (not in EXIT_ORDER) are sorted alphabetically at the end.
 */
export function sortExits(exits: ExitEdgeResult[]): ExitEdgeResult[] {
    return [...exits].sort((a, b) => {
        const orderA = EXIT_ORDER[a.direction]
        const orderB = EXIT_ORDER[b.direction]

        // Both in EXIT_ORDER: compare by order
        if (orderA !== undefined && orderB !== undefined) {
            return orderA - orderB
        }

        // a in EXIT_ORDER, b semantic: a comes first
        if (orderA !== undefined) return -1

        // b in EXIT_ORDER, a semantic: b comes first
        if (orderB !== undefined) return 1

        // Both semantic: alphabetical
        return a.direction.localeCompare(b.direction)
    })
}

/**
 * Generate a human-readable summary of exits from a list of exit edges.
 * Format: "Exits: north, south, east" or "No exits available."
 * @param exits - Array of exit edges
 * @returns Human-readable exit summary string
 */
export function generateExitsSummaryCache(exits: ExitEdgeResult[]): string {
    if (!exits || exits.length === 0) {
        return 'No exits available.'
    }

    const sortedExits = sortExits(exits)
    const directions = sortedExits.map((e) => e.direction).join(', ')
    return `Exits: ${directions}`
}

/**
 * Repository interface for exit edge retrieval and ordering operations.
 * Creation operations remain in locationRepository (ensureExit, ensureExitBidirectional).
 */
export interface IExitRepository {
    /**
     * Get all exits from a location, ordered canonically.
     * @param locationId - Source location ID
     * @returns Ordered array of exit edges
     */
    getExits(locationId: string): Promise<ExitEdgeResult[]>
}

/**
 * Cosmos/Gremlin implementation of exit repository operations.
 */
@injectable()
export class CosmosExitRepository implements IExitRepository {
    constructor(@inject('GremlinClient') private client: IGremlinClient) {}

    async getExits(locationId: string): Promise<ExitEdgeResult[]> {
        const exitsRaw = await this.client.submit<Record<string, unknown>>(
            "g.V(locationId).outE('exit').project('direction','toLocationId','description','kind','state')" +
                ".by(values('direction')).by(inV().id()).by(values('description')).by(values('kind')).by(values('state'))",
            { locationId }
        )

        const exits: ExitEdgeResult[] = (exitsRaw || []).map((e) => ({
            direction: String(e.direction) as Direction,
            toLocationId: String(e.toLocationId),
            description: e.description ? String(e.description) : undefined,
            kind: e.kind ? String(e.kind) : undefined,
            state: e.state ? String(e.state) : undefined
        }))

        return sortExits(exits)
    }
}
