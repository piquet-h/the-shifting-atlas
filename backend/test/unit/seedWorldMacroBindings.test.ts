import assert from 'node:assert/strict'
import test from 'node:test'

import { type Location, type LocationExit } from '@piquet-h/shared'
import { type ILocationRepository } from '../../src/repos/locationRepository.js'
import { seedWorld } from '../../src/seeding/seedWorld.js'

class TestLocationRepository implements ILocationRepository {
    private locations = new Map<string, Location>()

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

    async setExitTravelDuration(): Promise<{ updated: boolean }> {
        return { updated: true }
    }
}

test('seedWorld: auto-applies macro atlas tags to known local anchor names', async () => {
    const repo = new TestLocationRepository()

    const northRoad: Location = {
        id: '00000000-0000-0000-0000-0000000000a1',
        name: 'North Road',
        description: 'Seeded road node',
        tags: ['settlement:mosswell'],
        exits: [{ direction: 'north', to: '00000000-0000-0000-0000-0000000000a2' }],
        version: 1
    }

    const northGate: Location = {
        id: '00000000-0000-0000-0000-0000000000a2',
        name: 'North Gate',
        description: 'Seeded gate node',
        tags: ['settlement:mosswell', 'frontier:boundary'],
        exits: [{ direction: 'south', to: northRoad.id }],
        version: 1
    }

    await seedWorld({ blueprint: [northRoad, northGate], locationRepository: repo })

    const storedRoad = await repo.get(northRoad.id)
    const storedGate = await repo.get(northGate.id)

    assert.ok(storedRoad?.tags?.includes('macro:area:lr-area-mosswell-fiordhead'))
    assert.ok(storedRoad?.tags?.includes('macro:route:mw-route-harbor-to-northgate'))
    assert.ok(storedRoad?.tags?.includes('macro:water:fjord-sound-head'))

    assert.ok(storedGate?.tags?.includes('macro:area:lr-area-mosswell-fiordhead'))
    assert.ok(storedGate?.tags?.includes('macro:route:mw-route-harbor-to-northgate'))
    assert.ok(storedGate?.tags?.includes('macro:water:fjord-sound-head'))
})
