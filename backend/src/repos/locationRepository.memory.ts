import { Direction, getOppositeDirection, isDirection, Location } from '@piquet-h/shared'
import { injectable } from 'inversify'
import starterLocationsData from '../data/villageLocations.json' with { type: 'json' }
import { ExitEdgeResult, generateExitsSummaryCache, IExitRepository, sortExits } from './exitRepository.js'
import { ILocationRepository } from './locationRepository.js'
import { computeContentHash } from './utils/index.js'

/**
 * In-memory implementation of ILocationRepository (and IExitRepository) used for local dev & tests.
 * Separated from interface file to align with player repository pattern for maintainability.
 */
@injectable()
export class InMemoryLocationRepository implements ILocationRepository, IExitRepository {
    private locations: Map<string, Location>
    private exitTravelDurations: Map<string, number> = new Map()
    constructor() {
        const locs = starterLocationsData as Location[]
        this.locations = new Map(locs.map((r) => [r.id, r]))
    }

    private exitKey(locationId: string, direction: string): string {
        return `${locationId}:${direction}`
    }

    async listAll(): Promise<Location[]> {
        return Array.from(this.locations.values())
    }

    async regenerateExitsSummaryCache(locationId: string): Promise<void> {
        const location = this.locations.get(locationId)
        if (!location) return
        const exits: ExitEdgeResult[] =
            location.exits?.map((e) => ({
                direction: e.direction as Direction,
                toLocationId: e.to || ''
            })) || []
        location.exitsSummaryCache = generateExitsSummaryCache(exits)
    }

    private sortLocationExits(
        exits: Array<{ direction: string; to?: string; description?: string }>
    ): Array<{ direction: string; to?: string; description?: string }> {
        const exitResults: ExitEdgeResult[] = exits.map((e) => ({
            direction: e.direction as Direction,
            toLocationId: e.to || '',
            description: e.description
        }))
        const sorted = sortExits(exitResults)
        return sorted.map((e) => ({
            direction: e.direction,
            to: e.toLocationId,
            description: e.description
        }))
    }

    async get(id: string): Promise<Location | undefined> {
        const location = this.locations.get(id)
        if (!location) return undefined

        // Hydrate optional travelDurationMs onto exits for callers that need it (e.g., move loop consistency).
        // Return a shallow clone to avoid mutating the stored record.
        if (!location.exits || location.exits.length === 0) return location

        return {
            ...location,
            exits: location.exits.map((e) => ({
                ...e,
                travelDurationMs: e.travelDurationMs ?? this.exitTravelDurations.get(this.exitKey(id, e.direction))
            }))
        }
    }

    async move(fromId: string, direction: string) {
        if (!isDirection(direction)) return { status: 'error', reason: 'no-exit' } as const
        const from = this.locations.get(fromId)
        if (!from) return { status: 'error', reason: 'from-missing' } as const
        const exit = from.exits?.find((e) => e.direction === direction)
        if (!exit || !exit.to) return { status: 'error', reason: 'no-exit' } as const
        const dest = this.locations.get(exit.to)
        if (!dest) return { status: 'error', reason: 'target-missing' } as const
        return { status: 'ok', location: dest } as const
    }

    async upsert(location: Location) {
        const existing = this.locations.get(location.id)
        if (existing) {
            const existingHash = computeContentHash(existing.name, existing.description, existing.tags)
            const newHash = computeContentHash(location.name, location.description, location.tags)
            const contentChanged = existingHash !== newHash
            const newVersion = contentChanged ? (existing.version || 0) + 1 : existing.version
            const sortedExits = location.exits ? this.sortLocationExits(location.exits) : existing.exits
            this.locations.set(location.id, {
                ...existing,
                name: location.name ?? existing.name,
                description: location.description ?? existing.description,
                exits: sortedExits,
                terrain: location.terrain ?? existing.terrain,
                exitAvailability: location.exitAvailability ?? existing.exitAvailability,
                tags: location.tags ?? existing.tags,
                version: newVersion ?? location.version
            })
            return { created: false, id: location.id, updatedRevision: contentChanged ? newVersion : undefined }
        }
        const sortedExits = location.exits ? this.sortLocationExits(location.exits) : []
        this.locations.set(location.id, { ...location, exits: sortedExits, version: location.version || 1 })
        return { created: true, id: location.id, updatedRevision: location.version || 1 }
    }

    async ensureExit(
        fromId: string,
        direction: string,
        toId: string,
        description?: string,
        opts?: { skipVertexCheck?: boolean; deferCacheRegen?: boolean }
    ) {
        if (!isDirection(direction)) return { created: false }
        const from = this.locations.get(fromId)
        const to = this.locations.get(toId)
        if (!from || !to) return { created: false }
        if (!from.exits) from.exits = []
        const existing = from.exits.find((e) => e.direction === direction && e.to === toId)
        if (existing) {
            if (description && !existing.description) existing.description = description
            return { created: false }
        }
        from.exits.push({ direction, to: toId, description })
        from.exits = this.sortLocationExits(from.exits)
        if (!opts?.deferCacheRegen) {
            await this.regenerateExitsSummaryCache(fromId)
        }
        return { created: true }
    }

    async ensureExitBidirectional(
        fromId: string,
        direction: string,
        toId: string,
        opts?: { reciprocal?: boolean; description?: string; reciprocalDescription?: string }
    ) {
        if (!isDirection(direction)) return { created: false }
        const result = await this.ensureExit(fromId, direction, toId, opts?.description)
        if (!opts?.reciprocal) {
            return result
        }
        const oppositeDir = getOppositeDirection(direction)
        const reciprocalResult = await this.ensureExit(toId, oppositeDir, fromId, opts?.reciprocalDescription)
        return { created: result.created, reciprocalCreated: reciprocalResult.created }
    }

    async removeExit(fromId: string, direction: string) {
        if (!isDirection(direction)) return { removed: false }
        const from = this.locations.get(fromId)
        if (!from || !from.exits) return { removed: false }
        const initialLength = from.exits.length
        from.exits = from.exits.filter((e) => !(e.direction === direction))
        const removed = from.exits.length < initialLength
        if (removed) {
            await this.regenerateExitsSummaryCache(fromId)
        }
        return { removed }
    }

    async deleteLocation(id: string): Promise<{ deleted: boolean }> {
        const existed = this.locations.delete(id)
        return { deleted: existed }
    }

    async applyExits(exits: Array<{ fromId: string; direction: string; toId: string; description?: string; reciprocal?: boolean }>) {
        let exitsCreated = 0
        let exitsSkipped = 0
        let reciprocalApplied = 0
        for (const exit of exits) {
            const result = await this.ensureExitBidirectional(exit.fromId, exit.direction, exit.toId, {
                reciprocal: exit.reciprocal,
                description: exit.description
            })
            if (result.created) exitsCreated++
            else exitsSkipped++
            if ('reciprocalCreated' in result && result.reciprocalCreated) reciprocalApplied++
        }
        return { exitsCreated, exitsSkipped, reciprocalApplied }
    }

    async updateExitsSummaryCache(locationId: string, cache: string) {
        const location = this.locations.get(locationId)
        if (!location) return { updated: false }
        location.exitsSummaryCache = cache
        return { updated: true }
    }

    async getExits(locationId: string): Promise<ExitEdgeResult[]> {
        const location = await this.get(locationId)
        if (!location || !location.exits) {
            return []
        }
        const exits: ExitEdgeResult[] = location.exits.map((exit) => ({
            direction: exit.direction as Direction,
            toLocationId: exit.to || '',
            description: exit.description,
            travelDurationMs: this.exitTravelDurations.get(this.exitKey(locationId, exit.direction))
        }))
        return sortExits(exits)
    }

    async setExitTravelDuration(fromId: string, direction: string, travelDurationMs: number): Promise<{ updated: boolean }> {
        if (!isDirection(direction)) return { updated: false }
        const from = this.locations.get(fromId)
        if (!from || !from.exits) return { updated: false }
        const exit = from.exits.find((e) => e.direction === direction)
        if (!exit) return { updated: false }
        this.exitTravelDurations.set(this.exitKey(fromId, direction), travelDurationMs)
        return { updated: true }
    }
}
