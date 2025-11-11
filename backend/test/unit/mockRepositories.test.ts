import assert from 'node:assert'
import { describe, test } from 'node:test'
import { Container } from 'inversify'
import { setupTestContainer } from '../helpers/testInversify.config.js'
import { IPlayerRepository } from '../../src/repos/playerRepository.js'
import { ILocationRepository } from '../../src/repos/locationRepository.js'
import { IExitRepository } from '../../src/repos/exitRepository.js'
import { IDescriptionRepository } from '../../src/repos/descriptionRepository.js'
import { MockPlayerRepository } from '../mocks/repositories/playerRepository.mock.js'
import { MockLocationRepository } from '../mocks/repositories/locationRepository.mock.js'
import { MockExitRepository } from '../mocks/repositories/exitRepository.mock.js'
import { MockDescriptionRepository } from '../mocks/repositories/descriptionRepository.mock.js'

describe('Mock Repositories', () => {
    describe('MockPlayerRepository', () => {
        test('basic operations', async () => {
            const repo = new MockPlayerRepository()

            // Test getOrCreate
            const result1 = await repo.getOrCreate('test-player-1')
            assert.equal(result1.created, true)
            assert.equal(result1.record.id, 'test-player-1')
            assert.equal(result1.record.guest, true)

            // Test get
            const record = await repo.get('test-player-1')
            assert.ok(record)
            assert.equal(record.id, 'test-player-1')

            // Test idempotent getOrCreate
            const result2 = await repo.getOrCreate('test-player-1')
            assert.equal(result2.created, false)

            // Test linkExternalId
            const linkResult = await repo.linkExternalId('test-player-1', 'ext-123')
            assert.equal(linkResult.updated, true)
            assert.equal(linkResult.record?.guest, false)

            // Test findByExternalId
            const found = await repo.findByExternalId('ext-123')
            assert.ok(found)
            assert.equal(found.id, 'test-player-1')
        })

        test('update method', async () => {
            const repo = new MockPlayerRepository()

            // Create a player first
            const { record: player } = await repo.getOrCreate('test-player-update')
            const originalLocationId = player.currentLocationId

            // Update the player location
            player.currentLocationId = 'new-location-123'
            const updated = await repo.update(player)

            // Verify update succeeded
            assert.equal(updated.currentLocationId, 'new-location-123')
            assert.notEqual(updated.currentLocationId, originalLocationId)
            assert.ok(updated.updatedUtc, 'updatedUtc should be set')

            // Verify persistence
            const retrieved = await repo.get('test-player-update')
            assert.ok(retrieved, 'player should still exist')
            assert.equal(retrieved.currentLocationId, 'new-location-123')
        })

        test('update throws error for non-existent player', async () => {
            const repo = new MockPlayerRepository()

            const fakePlayer = {
                id: 'non-existent-player',
                createdUtc: new Date().toISOString(),
                updatedUtc: new Date().toISOString(),
                guest: true,
                currentLocationId: 'some-location'
            }

            await assert.rejects(
                async () => await repo.update(fakePlayer),
                /Player.*not found/,
                'should throw error for non-existent player'
            )
        })
    })

    describe('MockLocationRepository', () => {
        test('basic operations', async () => {
            const repo = new MockLocationRepository()

            // Test upsert
            const result = await repo.upsert({
                id: 'test-loc-1',
                name: 'Test Location',
                description: 'A test location',
                exits: []
            })
            assert.equal(result.created, true)

            // Test get
            const location = await repo.get('test-loc-1')
            assert.ok(location)
            assert.equal(location.name, 'Test Location')

            // Test ensureExit
            await repo.upsert({ id: 'test-loc-2', name: 'Test Loc 2', description: 'Destination', exits: [] })
            const exitResult = await repo.ensureExit('test-loc-1', 'north', 'test-loc-2')
            assert.equal(exitResult.created, true)

            // Test move
            const moveResult = await repo.move('test-loc-1', 'north')
            assert.equal(moveResult.status, 'ok')
            if (moveResult.status === 'ok') {
                assert.equal(moveResult.location.id, 'test-loc-2')
            }
        })
    })

    describe('MockExitRepository', () => {
        test('basic operations', async () => {
            const repo = new MockExitRepository()

            // Test empty exits
            const exits1 = await repo.getExits('unknown-location')
            assert.equal(exits1.length, 0)

            // Test with exits
            repo.setExits('test-loc', [
                { direction: 'north', toLocationId: 'loc-n', description: 'North exit' },
                { direction: 'south', toLocationId: 'loc-s' }
            ])

            const exits2 = await repo.getExits('test-loc')
            assert.equal(exits2.length, 2)
            assert.equal(exits2[0].direction, 'north')
        })
    })

    describe('MockDescriptionRepository', () => {
        test('basic operations', async () => {
            const repo = new MockDescriptionRepository()

            // Test empty layers
            const layers1 = await repo.getLayersForLocation('test-loc')
            assert.equal(layers1.length, 0)

            // Test addLayer
            const addResult = await repo.addLayer({
                id: 'layer-1',
                locationId: 'test-loc',
                type: 'ambient',
                content: 'A gentle breeze',
                createdAt: new Date().toISOString()
            })
            assert.equal(addResult.created, true)

            // Test getLayersForLocation
            const layers2 = await repo.getLayersForLocation('test-loc')
            assert.equal(layers2.length, 1)
            assert.equal(layers2[0].content, 'A gentle breeze')

            // Test archiveLayer
            const archiveResult = await repo.archiveLayer('layer-1')
            assert.equal(archiveResult.archived, true)

            // Archived layers shouldn't appear
            const layers3 = await repo.getLayersForLocation('test-loc')
            assert.equal(layers3.length, 0)
        })
    })

    describe('Container registration', () => {
        test('mock mode', async () => {
            const container = new Container()
            await setupTestContainer(container, 'mock')

            const playerRepo = container.get<IPlayerRepository>('IPlayerRepository')
            const locationRepo = container.get<ILocationRepository>('ILocationRepository')
            const exitRepo = container.get<IExitRepository>('IExitRepository')
            const descRepo = container.get<IDescriptionRepository>('IDescriptionRepository')

            assert.ok(playerRepo instanceof MockPlayerRepository)
            assert.ok(locationRepo instanceof MockLocationRepository)
            assert.ok(exitRepo instanceof MockExitRepository)
            assert.ok(descRepo instanceof MockDescriptionRepository)
        })
    })
})
