import { Location } from '@piquet-h/shared'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { v4 as uuidv4 } from 'uuid'
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

    describe('exitAvailability persistence and hydration', () => {
        test('upsert with pending exitAvailability is hydrated on get', async () => {
            const repo = await fixture.getLocationRepository()
            const locId = uuidv4()

            const location: Location = {
                id: locId,
                name: 'Frontier Outpost',
                description: 'Edge of the known world',
                exits: [],
                exitAvailability: {
                    pending: {
                        north: 'unexplored wilderness',
                        east: 'dense forest ahead'
                    }
                },
                version: 1
            }

            await repo.upsert(location)
            const retrieved = await repo.get(locId)

            assert.ok(retrieved, 'Location should be retrievable')
            assert.ok(retrieved.exitAvailability, 'exitAvailability should be populated')
            assert.ok(retrieved.exitAvailability.pending, 'pending should be populated')
            assert.strictEqual(retrieved.exitAvailability.pending['north'], 'unexplored wilderness')
            assert.strictEqual(retrieved.exitAvailability.pending['east'], 'dense forest ahead')
        })

        test('upsert with forbidden exitAvailability is hydrated on get', async () => {
            const repo = await fixture.getLocationRepository()
            const locId = uuidv4()

            const location: Location = {
                id: locId,
                name: 'Dead End',
                description: 'No passage beyond',
                exits: [],
                exitAvailability: {
                    forbidden: {
                        north: 'collapsed tunnel',
                        west: 'sheer cliff'
                    }
                },
                version: 1
            }

            await repo.upsert(location)
            const retrieved = await repo.get(locId)

            assert.ok(retrieved, 'Location should be retrievable')
            assert.ok(retrieved.exitAvailability, 'exitAvailability should be populated')
            assert.ok(retrieved.exitAvailability.forbidden, 'forbidden should be populated')
            assert.strictEqual(retrieved.exitAvailability.forbidden['north'], 'collapsed tunnel')
            assert.strictEqual(retrieved.exitAvailability.forbidden['west'], 'sheer cliff')
        })

        test('upsert with both pending and forbidden is hydrated on get', async () => {
            const repo = await fixture.getLocationRepository()
            const locId = uuidv4()

            const location: Location = {
                id: locId,
                name: 'Mixed Frontier',
                description: 'Some paths open, some blocked',
                exits: [],
                exitAvailability: {
                    pending: { north: 'awaiting exploration' },
                    forbidden: { south: 'impassable marsh' }
                },
                version: 1
            }

            await repo.upsert(location)
            const retrieved = await repo.get(locId)

            assert.ok(retrieved?.exitAvailability?.pending, 'pending should be hydrated')
            assert.ok(retrieved?.exitAvailability?.forbidden, 'forbidden should be hydrated')
            assert.strictEqual(retrieved.exitAvailability.pending!['north'], 'awaiting exploration')
            assert.strictEqual(retrieved.exitAvailability.forbidden!['south'], 'impassable marsh')
        })

        test('location without exitAvailability returns undefined exitAvailability', async () => {
            const repo = await fixture.getLocationRepository()
            const locId = uuidv4()

            const location: Location = {
                id: locId,
                name: 'Plain Location',
                description: 'No frontier metadata',
                exits: [],
                version: 1
            }

            await repo.upsert(location)
            const retrieved = await repo.get(locId)

            assert.ok(retrieved, 'Location should be retrievable')
            assert.strictEqual(retrieved.exitAvailability, undefined, 'exitAvailability should be undefined')
        })

        test('move returns destination with exitAvailability populated', async () => {
            const repo = await fixture.getLocationRepository()
            const srcId = uuidv4()
            const destId = uuidv4()

            await repo.upsert({
                id: srcId,
                name: 'Start',
                description: 'Starting point',
                exits: [{ direction: 'north', to: destId }],
                version: 1
            })
            await repo.upsert({
                id: destId,
                name: 'Frontier',
                description: 'Has pending exits',
                exits: [{ direction: 'south', to: srcId }],
                exitAvailability: { pending: { north: 'open frontier' } },
                version: 1
            })
            await repo.ensureExit(srcId, 'north', destId)

            const result = await repo.move(srcId, 'north')

            assert.strictEqual(result.status, 'ok')
            assert.ok(result.location, 'Destination location should be returned')
            assert.ok(result.location.exitAvailability, 'Destination exitAvailability should be populated')
            assert.ok(result.location.exitAvailability.pending, 'pending should be populated on destination')
            assert.strictEqual(result.location.exitAvailability.pending['north'], 'open frontier')
        })

        test('updating exitAvailability replaces existing metadata on subsequent get', async () => {
            const repo = await fixture.getLocationRepository()
            const locId = uuidv4()

            // First upsert with pending
            await repo.upsert({
                id: locId,
                name: 'Evolving Location',
                description: 'Frontier becoming settled',
                exits: [],
                exitAvailability: { pending: { north: 'being explored' } },
                version: 1
            })

            // Second upsert with updated pending (simulates exit being resolved)
            await repo.upsert({
                id: locId,
                name: 'Evolving Location',
                description: 'Frontier becoming settled',
                exits: [],
                exitAvailability: { pending: { south: 'new exploration' } },
                version: 1
            })

            const retrieved = await repo.get(locId)
            assert.ok(retrieved, 'Location should exist')
            assert.ok(retrieved.exitAvailability?.pending, 'exitAvailability should be populated')
            assert.strictEqual(retrieved.exitAvailability.pending!['south'], 'new exploration', 'Updated pending entry should be present')
        })
    })
})
