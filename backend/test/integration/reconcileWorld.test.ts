import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { reconcile } from '../../scripts/reconcile-world.js'
import type { ILayerRepository } from '../../src/repos/layerRepository.js'
import type { ILocationClockRepository } from '../../src/repos/locationClockRepository.js'
import type { ILocationRepository } from '../../src/repos/locationRepository.js'
import type { IPlayerDocRepository } from '../../src/repos/PlayerDocRepository.js'
import type { IPlayerRepository } from '../../src/repos/playerRepository.js'
import { describeForBothModes } from '../helpers/describeForBothModes.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

const NORTH_GATE_ID = 'd0b2a7ea-9f4c-41d5-9b2d-7b4a0e6f1c3a'

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
        // This test verifies the reconcile logic by directly working within the reconcile container
        // We use beforeDiff to set up test state, then verify the results within the reconcile container itself

        const extraLocationId = '00000000-0000-4000-8000-0000000000AA'
        let reconcileLocRepo: ILocationRepository | undefined

        // Run reconciliation with prune-locations
        await reconcile(
            { mode: mode as 'memory' | 'cosmos', dryRun: false, pruneExits: false, pruneLocations: true },
            {
                beforeDiff: async (createdContainer) => {
                    // Get the reconcile container's repo and add extra location
                    reconcileLocRepo = createdContainer.get<ILocationRepository>('ILocationRepository')

                    // Add extra location that should be pruned
                    await reconcileLocRepo.upsert({
                        id: extraLocationId,
                        name: 'Temp',
                        description: 'To be pruned',
                        exits: []
                    })
                }
            }
        )

        // After reconciliation, verify within the same container
        assert.ok(reconcileLocRepo, 'Reconcile repo should be available')

        // Verify extra location was deleted (not protected)
        const stillExists = await reconcileLocRepo!.get(extraLocationId)
        assert.ok(!stillExists, 'Extra location should be pruned (no protection)')

        // Verify starter location remains (always protected)
        const starterExists = await reconcileLocRepo!.get(STARTER_LOCATION_ID)
        assert.ok(starterExists, 'Starter location should never be deleted')
    })

    test('clean-start reset restores Mosswell macro tags, prunes generated frontier, resets all character locations, and purges location layers', async () => {
        const extraLocationId = '00000000-0000-4000-8000-0000000000BB'
        const frontierPlayerId = '11111111-1111-4111-8111-111111111111'
        const gatePlayerId = '22222222-2222-4222-8222-222222222222'

        let locRepo!: ILocationRepository
        let playerRepo!: IPlayerRepository
        let playerDocRepo!: IPlayerDocRepository
        let layerRepo!: ILayerRepository
        let clockRepo!: ILocationClockRepository

        const summary = await reconcile(
            {
                mode: mode as 'memory' | 'cosmos',
                dryRun: false,
                pruneExits: true,
                pruneLocations: true,
                resetPlayers: 'all',
                purgeLayers: true
            },
            {
                beforeDiff: async (createdContainer) => {
                    locRepo = createdContainer.get<ILocationRepository>('ILocationRepository')
                    playerRepo = createdContainer.get<IPlayerRepository>('IPlayerRepository')
                    playerDocRepo = createdContainer.get<IPlayerDocRepository>('IPlayerDocRepository')
                    layerRepo = createdContainer.get<ILayerRepository>('ILayerRepository')
                    clockRepo = createdContainer.get<ILocationClockRepository>('ILocationClockRepository')

                    await locRepo.upsert({
                        id: extraLocationId,
                        name: 'Generated Frontier Clearing',
                        description: 'Procedural clearing beyond North Gate',
                        exits: [{ direction: 'south', to: NORTH_GATE_ID }]
                    })
                    await locRepo.ensureExit(NORTH_GATE_ID, 'north', extraLocationId, 'Generated trail north')
                    await clockRepo.initialize(extraLocationId, 5000)

                    const { record: p1 } = await playerRepo.getOrCreate(frontierPlayerId)
                    await playerRepo.linkExternalId(p1.id, 'entra-sub-frontier')
                    await playerRepo.update({ ...(await playerRepo.get(p1.id))!, name: 'Aria', currentLocationId: extraLocationId })
                    await playerDocRepo.upsertPlayer({
                        id: p1.id,
                        createdUtc: p1.createdUtc,
                        updatedUtc: p1.createdUtc,
                        currentLocationId: extraLocationId,
                        attributes: { class: 'ranger' },
                        inventoryVersion: 2
                    })

                    const { record: p2 } = await playerRepo.getOrCreate(gatePlayerId)
                    await playerRepo.update({ ...p2, name: 'Bram', currentLocationId: NORTH_GATE_ID })

                    await layerRepo.setLayerForLocation(STARTER_LOCATION_ID, 'base', 0, null, 'Stale AI base prose')
                    await layerRepo.setLayerForLocation(extraLocationId, 'ambient', 0, null, 'Stale frontier fog')
                    await layerRepo.setLayerForRealm('mosswell-realm', 'ambient', 0, null, 'Preserved realm weather')
                }
            }
        )

        assert.strictEqual(await locRepo.get(extraLocationId), undefined, 'Generated frontier vertex must be pruned')
        const northGate = await locRepo.get(NORTH_GATE_ID)
        assert.ok(northGate, 'North Gate blueprint vertex must exist')
        assert.strictEqual(
            northGate.exits?.some((exit) => exit.direction === 'north'),
            false,
            'Materialized frontier exit from North Gate must be pruned'
        )

        const starter = await locRepo.get(STARTER_LOCATION_ID)
        assert.ok(starter?.tags?.includes('macro:area:lr-area-mosswell-fiordhead'), 'Macro area tag must be stamped on Mosswell seed')
        assert.ok(starter?.tags?.includes('macro:water:fjord-sound-head'), 'Macro water tag must be stamped on Mosswell seed')

        const p1After = await playerRepo.get(frontierPlayerId)
        const p2After = await playerRepo.get(gatePlayerId)
        const p1DocAfter = await playerDocRepo.getPlayer(frontierPlayerId)
        assert.strictEqual(p1After?.currentLocationId, STARTER_LOCATION_ID, 'Frontier player must reset to Mosswell River Jetty')
        assert.strictEqual(p1After?.externalId, 'entra-sub-frontier', 'Linked identity must be preserved')
        assert.strictEqual(p2After?.currentLocationId, STARTER_LOCATION_ID, 'In-town player must reset to Mosswell River Jetty')
        assert.strictEqual(p1DocAfter?.currentLocationId, STARTER_LOCATION_ID, 'PlayerDoc projection must also reset to starter location')

        assert.strictEqual(
            await layerRepo.getActiveLayerForLocation(STARTER_LOCATION_ID, 'base', 10),
            null,
            'Stale location base layer must be purged'
        )
        assert.strictEqual(
            await layerRepo.getActiveLayerForLocation(extraLocationId, 'ambient', 10),
            null,
            'Pruned location ambient layer must be purged'
        )
        assert.ok(await layerRepo.getActiveLayer('realm:mosswell-realm', 'ambient', 10), 'Non-location realm layers must remain untouched')
        assert.strictEqual(await clockRepo.get(extraLocationId), undefined, 'Pruned location clock must be removed')
        assert.ok(summary.playersRelocated >= 2)
        assert.ok(summary.layersPurged >= 2)
    })

    test('pruneLocations relocates orphaned players to starter location while leaving in-blueprint players in place by default', async () => {
        const extraLocationId = '00000000-0000-4000-8000-0000000000CC'
        const orphanPlayerId = '33333333-3333-4333-8333-333333333333'
        const townPlayerId = '44444444-4444-4444-8444-444444444444'

        let playerRepo!: IPlayerRepository

        await reconcile(
            { mode: mode as 'memory' | 'cosmos', dryRun: false, pruneExits: true, pruneLocations: true },
            {
                beforeDiff: async (createdContainer) => {
                    const locRepo = createdContainer.get<ILocationRepository>('ILocationRepository')
                    playerRepo = createdContainer.get<IPlayerRepository>('IPlayerRepository')

                    await locRepo.upsert({
                        id: extraLocationId,
                        name: 'Orphaned Cave',
                        description: 'Soon to be pruned',
                        exits: []
                    })

                    const { record: orphan } = await playerRepo.getOrCreate(orphanPlayerId)
                    await playerRepo.update({ ...orphan, currentLocationId: extraLocationId })

                    const { record: townie } = await playerRepo.getOrCreate(townPlayerId)
                    await playerRepo.update({ ...townie, currentLocationId: NORTH_GATE_ID })
                }
            }
        )

        assert.strictEqual((await playerRepo.get(orphanPlayerId))?.currentLocationId, STARTER_LOCATION_ID)
        assert.strictEqual((await playerRepo.get(townPlayerId))?.currentLocationId, NORTH_GATE_ID)
    })

    test('dryRun previews clean-start reset counts without mutating locations or player coordinates', async () => {
        const extraLocationId = '00000000-0000-4000-8000-0000000000DD'
        const playerId = '55555555-5555-4555-8555-555555555555'

        let locRepo!: ILocationRepository
        let playerRepo!: IPlayerRepository

        const summary = await reconcile(
            {
                mode: mode as 'memory' | 'cosmos',
                dryRun: true,
                pruneExits: true,
                pruneLocations: true,
                resetPlayers: 'all',
                purgeLayers: true
            },
            {
                beforeDiff: async (createdContainer) => {
                    locRepo = createdContainer.get<ILocationRepository>('ILocationRepository')
                    playerRepo = createdContainer.get<IPlayerRepository>('IPlayerRepository')

                    await locRepo.upsert({
                        id: extraLocationId,
                        name: 'Dry Run Node',
                        description: 'Should survive dry run',
                        exits: []
                    })

                    const { record } = await playerRepo.getOrCreate(playerId)
                    await playerRepo.update({ ...record, currentLocationId: extraLocationId })
                }
            }
        )

        assert.strictEqual(summary.dryRun, true)
        assert.ok(summary.playersRelocated >= 1)
        assert.ok(await locRepo.get(extraLocationId), 'Dry run must not delete extra locations')
        assert.strictEqual((await playerRepo.get(playerId))?.currentLocationId, extraLocationId, 'Dry run must not move players')
    })
})
