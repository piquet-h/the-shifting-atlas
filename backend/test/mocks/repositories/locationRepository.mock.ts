import { Direction, Location, getOppositeDirection, isDirection } from '@piquet-h/shared'
import { injectable } from 'inversify'
import { generateExitsSummaryCache } from '../../../src/repos/exitRepository.js'
import { ILocationRepository } from '../../../src/repos/locationRepository.js'

/**
 * Mock implementation of ILocationRepository for unit tests.
 * Provides predictable behavior and test control.
 */
@injectable()
export class MockLocationRepository implements ILocationRepository {
    private mockLocations = new Map<string, Location>()

    // Test helpers
    setLocation(id: string, location: Location): void {
        this.mockLocations.set(id, location)
    }

    clear(): void {
        this.mockLocations.clear()
    }

    async get(id: string): Promise<Location | undefined> {
        return this.mockLocations.get(id)
    }

    async move(fromId: string, direction: string) {
        if (!isDirection(direction)) return { status: 'error', reason: 'no-exit' } as const
        const from = this.mockLocations.get(fromId)
        if (!from) return { status: 'error', reason: 'from-missing' } as const
        const exit = from.exits?.find((e) => e.direction === direction)
        if (!exit || !exit.to) return { status: 'error', reason: 'no-exit' } as const
        const dest = this.mockLocations.get(exit.to)
        if (!dest) return { status: 'error', reason: 'target-missing' } as const
        return { status: 'ok', location: dest } as const
    }

    async upsert(location: Location) {
        const existing = this.mockLocations.get(location.id)
        if (existing) {
            const contentChanged = existing.name !== location.name || existing.description !== location.description
            const newVersion = contentChanged ? (existing.version || 0) + 1 : existing.version

            this.mockLocations.set(location.id, {
                ...existing,
                name: location.name ?? existing.name,
                description: location.description ?? existing.description,
                exits: location.exits || existing.exits,
                version: newVersion ?? location.version
            })
            return { created: false, id: location.id, updatedRevision: contentChanged ? newVersion : undefined }
        }
        this.mockLocations.set(location.id, { ...location, exits: location.exits || [], version: location.version || 1 })
        return { created: true, id: location.id, updatedRevision: location.version || 1 }
    }

    async ensureExit(fromId: string, direction: string, toId: string, description?: string) {
        if (!isDirection(direction)) return { created: false }
        const from = this.mockLocations.get(fromId)
        const to = this.mockLocations.get(toId)
        if (!from || !to) return { created: false }
        if (!from.exits) from.exits = []
        const existing = from.exits.find((e) => e.direction === direction && e.to === toId)
        if (existing) {
            if (description && !existing.description) existing.description = description
            return { created: false }
        }
        from.exits.push({ direction, to: toId, description })
        this.regenerateExitsSummaryCache(fromId)
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
        const from = this.mockLocations.get(fromId)
        if (!from || !from.exits) return { removed: false }
        const initialLength = from.exits.length
        from.exits = from.exits.filter((e) => !(e.direction === direction))
        const removed = from.exits.length < initialLength
        if (removed) {
            this.regenerateExitsSummaryCache(fromId)
        }
        return { removed }
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
        const location = this.mockLocations.get(locationId)
        if (!location) return { updated: false }
        location.exitsSummaryCache = cache
        return { updated: true }
    }

    async regenerateExitsSummaryCache(locationId: string): Promise<void> {
        const location = this.mockLocations.get(locationId)
        if (!location) return

        // Direction-only cache (ignore exit descriptions)
        const exits =
            location.exits?.map((e) => ({
                direction: e.direction as Direction,
                toLocationId: e.to || ''
            })) || []

        location.exitsSummaryCache = generateExitsSummaryCache(exits)
    }

    async listAll(): Promise<Location[]> {
        return Array.from(this.mockLocations.values())
    }

    async deleteLocation(id: string): Promise<{ deleted: boolean }> {
        const existed = this.mockLocations.delete(id)
        return { deleted: existed }
    }
}
