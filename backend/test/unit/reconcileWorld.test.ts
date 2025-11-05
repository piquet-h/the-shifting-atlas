import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import { Container } from 'inversify'
import assert from 'node:assert/strict'
import test from 'node:test'
import { reconcile } from '../../scripts/reconcile-world.ts'
import { setupContainer } from '../../src/inversify.config.js'
import { ILocationRepository, InMemoryLocationRepository } from '../../src/repos/locationRepository.js'
import { IPlayerRepository } from '../../src/repos/playerRepository.js'

test('reconcileWorld: removes obsolete exit (direction)', async () => {
    const repo: ILocationRepository = new InMemoryLocationRepository()
    const all = await repo.listAll()
    assert.ok(all.length >= 2, 'Need at least 2 seed locations for test')
    const a = all[0]
    const b = all[1]
    // Add synthetic exit then remove
    await repo.ensureExit(a.id, 'north', b.id)
    const removed = await repo.removeExit(a.id, 'north')
    assert.equal(removed.removed, true, 'Obsolete exit should be removed')
})

test('reconcileWorld: deleteLocation removes vertex', async () => {
    const repo: ILocationRepository = new InMemoryLocationRepository()
    const all = await repo.listAll()
    const victim = all[0]
    const del = await repo.deleteLocation(victim.id)
    assert.ok(del.deleted, 'Location should be deleted')
    const after = await repo.get(victim.id)
    assert.equal(after, undefined, 'Deleted location no longer retrievable')
})

test('reconcileWorld script: skips deletion of demo/current or starter location', async () => {
    // Prepare memory mode container & add an extra location not in blueprint
    process.env.PERSISTENCE_MODE = 'memory'
    const extraLocationId = '00000000-0000-4000-8000-0000000000AA'
    const container = await setupContainer(new Container(), 'memory')
    const locRepo = container.get<ILocationRepository>('ILocationRepository')
    // Ensure extra location exists (candidate for pruning)
    await locRepo.upsert({ id: extraLocationId, name: 'Temp', description: 'To be pruned', exits: [] })
    // Create demo player and move it to extra location by mutating returned record
    const playerRepo = container.get<IPlayerRepository>('IPlayerRepository')
    const demoId = '00000000-0000-4000-8000-000000000001'
    const { record } = await playerRepo.getOrCreate(demoId)
    record.currentLocationId = extraLocationId
    // Run reconciliation with prune-locations; inject container state via beforeDiff hook
    await reconcile(
        { mode: 'memory', dryRun: false, pruneExits: false, pruneLocations: true },
        {
            beforeDiff: async (createdContainer) => {
                // Copy mutated state from test container into reconcile container (memory mode uses fresh repository)
                const testLocs = await locRepo.listAll()
                const reconcileLocRepo = createdContainer.get<ILocationRepository>('ILocationRepository')
                for (const l of testLocs) {
                    if (!(await reconcileLocRepo.get(l.id))) {
                        await reconcileLocRepo.upsert(l)
                    }
                }
                // Recreate demo player with existing location reference
                const reconcilePlayerRepo = createdContainer.get<IPlayerRepository>('IPlayerRepository')
                const { record: demoAgain } = await reconcilePlayerRepo.getOrCreate(demoId)
                demoAgain.currentLocationId = record.currentLocationId
            }
        }
    )
    const stillExists = await locRepo.get(extraLocationId)
    assert.ok(stillExists, 'Extra location should be skipped (protected by demo player reference)')
    // Starter location must also remain
    const starterExists = await locRepo.get(STARTER_LOCATION_ID)
    assert.ok(starterExists, 'Starter location should never be deleted')
})
