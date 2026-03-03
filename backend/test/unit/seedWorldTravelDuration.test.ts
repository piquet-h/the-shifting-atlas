import assert from 'node:assert/strict'
import test from 'node:test'

import { type Location, type LocationExit } from '@piquet-h/shared'
import { type ILocationRepository } from '../../src/repos/locationRepository.js'
import { seedWorld } from '../../src/seeding/seedWorld.js'

class TestLocationRepository implements ILocationRepository {
    private locations = new Map<string, Location>()
    public readonly travelDurations = new Map<string, number>()

    async get(id: string): Promise<Location | undefined> {
        return this.locations.get(id)
    }

    async move(): Promise<{ status: 'error'; reason: string }> {
        return { status: 'error', reason: 'not-implemented' }
    }

    async upsert(location: Location): Promise<{ created: boolean; id: string; updatedRevision?: number | undefined }> {
        const exists = this.locations.has(location.id)
        this.locations.set(location.id, structuredClone(location))
        return { created: !exists, id: location.id, updatedRevision: location.version }
    }

    async listAll(): Promise<Location[]> {
        return Array.from(this.locations.values())
    }

    async ensureExit(fromId: string, direction: string, toId: string, description?: string): Promise<{ created: boolean }> {
        const from = this.locations.get(fromId)
        if (!from) return { created: false }
        if (!from.exits) from.exits = []
        const existing = from.exits.find((e) => e.direction === direction)
        if (existing) return { created: false }
        from.exits.push({ direction, to: toId, description } as LocationExit)
        return { created: true }
    }

    async ensureExitBidirectional(): Promise<{ created: boolean; reciprocalCreated?: boolean | undefined }> {
        return { created: false }
    }

    async removeExit(): Promise<{ removed: boolean }> {
        return { removed: false }
    }

    async deleteLocation(): Promise<{ deleted: boolean }> {
        return { deleted: false }
    }

    async applyExits(): Promise<{ exitsCreated: number; exitsSkipped: number; reciprocalApplied: number }> {
        return { exitsCreated: 0, exitsSkipped: 0, reciprocalApplied: 0 }
    }

    async updateExitsSummaryCache(): Promise<{ updated: boolean }> {
        return { updated: false }
    }

    async regenerateExitsSummaryCache(): Promise<void> {
        return
    }

    async setExitTravelDuration(fromId: string, direction: string, travelDurationMs: number): Promise<{ updated: boolean }> {
        this.travelDurations.set(`${fromId}:${direction}`, travelDurationMs)
        return { updated: true }
    }
}

test('seedWorld: persists travelDurationMs for exits when provided in blueprint', async () => {
    const repo = new TestLocationRepository()

    const A: Location = {
        id: '00000000-0000-0000-0000-0000000000a1',
        name: 'A',
        description: 'A',
        exits: [
            {
                direction: 'east',
                to: '00000000-0000-0000-0000-0000000000b2',
                description: 'to B',
                travelDurationMs: 123_000
            }
        ],
        version: 1
    }

    const B: Location = {
        id: '00000000-0000-0000-0000-0000000000b2',
        name: 'B',
        description: 'B',
        exits: [],
        version: 1
    }

    await seedWorld({ blueprint: [A, B], locationRepository: repo })

    assert.equal(repo.travelDurations.get(`${A.id}:east`), 123_000)
})
