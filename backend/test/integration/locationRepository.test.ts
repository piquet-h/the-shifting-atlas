import { Location } from '@piquet-h/shared'
import assert from 'node:assert'
import { afterEach, beforeEach, test } from 'node:test'
import { describeForBothModes } from '../helpers/describeForBothModes.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describeForBothModes('Location Repository', (mode) => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture(mode)
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('get returns location', async () => {
        const repo = await fixture.getLocationRepository()
        const location = await repo.get('a4d1c3f1-5b2a-4f7d-9d4b-8f0c2a6b7e21') // Mosswell River Jetty

        assert.ok(location)
        assert.strictEqual(location.name, 'Mosswell River Jetty')
    })

    test('move with valid exit', async () => {
        const repo = await fixture.getLocationRepository()
        // Mosswell River Jetty has a 'south' exit to North Road
        const result = await repo.move('a4d1c3f1-5b2a-4f7d-9d4b-8f0c2a6b7e21', 'south')

        assert.strictEqual(result.status, 'ok')
        assert.ok(result.location)
    })

    test('move with invalid exit returns error', async () => {
        const repo = await fixture.getLocationRepository()
        const result = await repo.move('a4d1c3f1-5b2a-4f7d-9d4b-8f0c2a6b7e21', 'up')

        assert.strictEqual(result.status, 'error')
        assert.strictEqual(result.reason, 'no-exit')
    })

    test('upsert creates new location', async () => {
        const repo = await fixture.getLocationRepository()
        const newLoc: Location = {
            id: 'test-loc',
            name: 'Test Location',
            description: 'A test location',
            exits: []
        }

        const result = await repo.upsert(newLoc)

        assert.strictEqual(result.created, true)
        assert.strictEqual(result.id, 'test-loc')

        const retrieved = await repo.get('test-loc')
        assert.ok(retrieved)
        assert.strictEqual(retrieved.name, 'Test Location')
    })

    test('upsert existing location updates', async () => {
        const repo = await fixture.getLocationRepository()
        const existingLoc: Location = {
            id: 'a4d1c3f1-5b2a-4f7d-9d4b-8f0c2a6b7e21',
            name: 'Updated Jetty',
            description: 'Updated description',
            exits: []
        }

        const result = await repo.upsert(existingLoc)

        assert.strictEqual(result.created, false)
        assert.ok(result.updatedRevision)

        const retrieved = await repo.get('a4d1c3f1-5b2a-4f7d-9d4b-8f0c2a6b7e21')
        assert.ok(retrieved)
        assert.strictEqual(retrieved.name, 'Updated Jetty')
    })

    test('ensureExit creates exit idempotently', async () => {
        const repo = await fixture.getLocationRepository()

        // Create locations first
        await repo.upsert({ id: 'loc-a', name: 'Location A', description: 'Start', exits: [] })
        await repo.upsert({ id: 'loc-b', name: 'Location B', description: 'End', exits: [] })

        // First call should create
        const result1 = await repo.ensureExit('loc-a', 'north', 'loc-b')
        assert.strictEqual(result1.created, true)

        // Second call should be idempotent
        const result2 = await repo.ensureExit('loc-a', 'north', 'loc-b')
        assert.strictEqual(result2.created, false)
    })
})
