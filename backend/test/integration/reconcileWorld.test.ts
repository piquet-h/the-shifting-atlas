import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { reconcile } from '../../scripts/reconcile-world.js'
import type { ILocationRepository } from '../../src/repos/locationRepository.js'
import { describeForBothModes } from '../helpers/describeForBothModes.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describeForBothModes('reconcileWorld', (mode) => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture(mode)
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('removes obsolete exit (direction)', async () => {
        const repo = await fixture.getLocationRepository()
        const all = await repo.listAll()
        assert.ok(all.length >= 2, 'Need at least 2 seed locations for test')
        const a = all[0]
        const b = all[1]

        // Add synthetic exit then remove
        await repo.ensureExit(a.id, 'north', b.id)
        const removed = await repo.removeExit(a.id, 'north')
        assert.strictEqual(removed.removed, true, 'Obsolete exit should be removed')
    })

    test('deleteLocation removes vertex', async () => {
        const repo = await fixture.getLocationRepository()
        const all = await repo.listAll()
        const victim = all[0]

        const del = await repo.deleteLocation(victim.id)
        assert.ok(del.deleted, 'Location should be deleted')

        const after = await repo.get(victim.id)
        assert.strictEqual(after, undefined, 'Deleted location no longer retrievable')
    })

    test('reconcile script: skips deletion of starter location, prunes unprotected extras', async () => {
        // Prepare test data - add an extra location not in blueprint
        const extraLocationId = '00000000-0000-4000-8000-0000000000AA'
        const locRepo = await fixture.getLocationRepository()

        // Ensure extra location exists (candidate for pruning)
        await locRepo.upsert({
            id: extraLocationId,
            name: 'Temp',
            description: 'To be pruned',
            exits: []
        })

        // Run reconciliation with prune-locations
        // Use beforeDiff hook to inject test state into reconcile container
        await reconcile(
            { mode: mode as 'memory' | 'cosmos', dryRun: false, pruneExits: false, pruneLocations: true },
            {
                beforeDiff: async (createdContainer) => {
                    // Copy mutated state from test container into reconcile container
                    const testLocs = await locRepo.listAll()
                    const reconcileLocRepo = createdContainer.get<ILocationRepository>('ILocationRepository')
                    for (const l of testLocs) {
                        if (!(await reconcileLocRepo.get(l.id))) {
                            await reconcileLocRepo.upsert(l)
                        }
                    }
                }
            }
        )

        // Verify extra location was deleted (not protected)
        const stillExists = await locRepo.get(extraLocationId)
        assert.ok(!stillExists, 'Extra location should be pruned (no protection)')

        // Verify starter location remains (always protected)
        const starterExists = await locRepo.get(STARTER_LOCATION_ID)
        assert.ok(starterExists, 'Starter location should never be deleted')
    })
})
