import assert from 'node:assert'
import { test } from 'node:test'
import { Container } from 'inversify'
import { setupContainer } from '../../src/inversify.config.js'
import { IPlayerRepository } from '../../src/repos/playerRepository.js'
import { MockPlayerRepository } from '../../src/repos/playerRepository.mock.js'
import { ILocationRepository } from '../../src/repos/locationRepository.js'
import { MockLocationRepository } from '../../src/repos/locationRepository.mock.js'
import { IExitRepository } from '../../src/repos/exitRepository.js'
import { MockExitRepository } from '../../src/repos/exitRepository.mock.js'
import { IDescriptionRepository } from '../../src/repos/descriptionRepository.js'
import { MockDescriptionRepository } from '../../src/repos/descriptionRepository.mock.js'
import { STARTER_LOCATION_ID } from '@piquet-h/shared'

test('MockPlayerRepository - basic operations', async () => {
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

test('MockLocationRepository - basic operations', async () => {
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

test('MockExitRepository - basic operations', async () => {
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

test('MockDescriptionRepository - basic operations', async () => {
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

test('Container registration - mock mode', async () => {
    const container = new Container()
    await setupContainer(container, 'mock')
    
    const playerRepo = container.get<IPlayerRepository>('IPlayerRepository')
    const locationRepo = container.get<ILocationRepository>('ILocationRepository')
    const exitRepo = container.get<IExitRepository>('IExitRepository')
    const descRepo = container.get<IDescriptionRepository>('IDescriptionRepository')
    
    assert.ok(playerRepo instanceof MockPlayerRepository)
    assert.ok(locationRepo instanceof MockLocationRepository)
    assert.ok(exitRepo instanceof MockExitRepository)
    assert.ok(descRepo instanceof MockDescriptionRepository)
})
