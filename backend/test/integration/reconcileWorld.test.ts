import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { reconcile } from '../../scripts/reconcile-world.js'
import type { ILocationRepository } from '../../src/repos/locationRepository.js'
import type { IPlayerRepository } from '../../src/repos/playerRepository.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import type { ContainerMode } from '../helpers/testInversify.config.js'

/**
 * Run test suite against both memory and cosmos modes
 * Cosmos mode tests will skip gracefully if infrastructure is not available
 */
function describeForBothModes(suiteName: string, testFn: (mode: ContainerMode) => void): void {
    const modes: ContainerMode[] = ['memory', 'cosmos']

    for (const mode of modes) {
        describe(`${suiteName} [${mode}]`, () => {
            // Skip cosmos tests if PERSISTENCE_MODE is not explicitly set to 'cosmos'
            // This allows tests to run in CI without requiring Cosmos DB credentials
            if (mode === 'cosmos' && process.env.PERSISTENCE_MODE !== 'cosmos') {
                test.skip('Cosmos tests skipped (PERSISTENCE_MODE != cosmos)', () => {})
                return
            }
            testFn(mode)
        })
    }
}

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

    test('reconcile script: skips deletion of demo/current or starter location', async () => {
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

        // Create demo player and move it to extra location
        const playerRepo = await fixture.getPlayerRepository()
        const demoId = '00000000-0000-4000-8000-000000000001'
        const { record } = await playerRepo.getOrCreate(demoId)
        record.currentLocationId = extraLocationId

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

                    // Recreate demo player with existing location reference
                    const reconcilePlayerRepo = createdContainer.get<IPlayerRepository>('IPlayerRepository')
                    const { record: demoAgain } = await reconcilePlayerRepo.getOrCreate(demoId)
                    demoAgain.currentLocationId = record.currentLocationId
                }
            }
        )

        // Verify extra location was protected
        const stillExists = await locRepo.get(extraLocationId)
        assert.ok(stillExists, 'Extra location should be skipped (protected by demo player reference)')

        // Verify starter location remains
        const starterExists = await locRepo.get(STARTER_LOCATION_ID)
        assert.ok(starterExists, 'Starter location should never be deleted')
    })
})
