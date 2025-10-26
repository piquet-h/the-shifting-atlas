import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { DescriptionLayer } from '../../src/repos/descriptionRepository.js'
import { __resetDescriptionRepositoryForTests } from '../../src/repos/descriptionRepository.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describe('Repository Interface Contracts', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('IPlayerRepository - has required methods', async () => {
        const repo = await fixture.getPlayerRepository()
        assert.ok(typeof repo.get === 'function', 'get method exists')
        assert.ok(typeof repo.getOrCreate === 'function', 'getOrCreate method exists')
        assert.ok(typeof repo.linkExternalId === 'function', 'linkExternalId method exists')
        assert.ok(typeof repo.findByExternalId === 'function', 'findByExternalId method exists')
    })

    test('IPlayerRepository - getOrCreate returns expected shape', async () => {
        const repo = await fixture.getPlayerRepository()
        const result = await repo.getOrCreate()
        assert.ok(result.record, 'record present')
        assert.ok(typeof result.created === 'boolean', 'created is boolean')
        assert.ok(result.record.id, 'record has id')
        assert.ok(result.record.createdUtc, 'record has createdUtc')
        assert.ok(typeof result.record.guest === 'boolean', 'guest is boolean')
    })

    test('ILocationRepository - has required methods', async () => {
        const repo = await fixture.getLocationRepository()
        assert.ok(typeof repo.get === 'function', 'get method exists')
        assert.ok(typeof repo.move === 'function', 'move method exists')
        assert.ok(typeof repo.upsert === 'function', 'upsert method exists')
        assert.ok(typeof repo.ensureExit === 'function', 'ensureExit method exists')
        assert.ok(typeof repo.ensureExitBidirectional === 'function', 'ensureExitBidirectional method exists')
        assert.ok(typeof repo.removeExit === 'function', 'removeExit method exists')
        assert.ok(typeof repo.applyExits === 'function', 'applyExits method exists')
    })

    test('ILocationRepository - upsert returns expected shape', async () => {
        const repo = await fixture.getLocationRepository()
        const result = await repo.upsert({
            id: 'test-loc-1',
            name: 'Test Location',
            description: 'A test location',
            version: 1
        })
        assert.ok(typeof result.created === 'boolean', 'created is boolean')
        assert.ok(result.id, 'id returned')
    })

    test('ILocationRepository - move returns expected union types', async () => {
        const repo = await fixture.getLocationRepository()
        const loc = {
            id: 'test-from',
            name: 'From',
            description: 'Start',
            exits: [{ direction: 'north', to: 'test-to' }],
            version: 1
        }
        const dest = { id: 'test-to', name: 'To', description: 'Destination', version: 1 }
        await repo.upsert(loc)
        await repo.upsert(dest)

        const okResult = await repo.move('test-from', 'north')
        assert.equal(okResult.status, 'ok')
        if (okResult.status === 'ok') {
            assert.ok(okResult.location, 'location present on ok')
        }

        const errResult = await repo.move('test-from', 'south')
        assert.equal(errResult.status, 'error')
        if (errResult.status === 'error') {
            assert.ok(errResult.reason, 'reason present on error')
        }
    })

    test('IDescriptionRepository - has required methods', async () => {
        const repo = await fixture.getDescriptionRepository()
        assert.ok(typeof repo.getLayersForLocation === 'function', 'getLayersForLocation method exists')
        assert.ok(typeof repo.addLayer === 'function', 'addLayer method exists')
        assert.ok(typeof repo.archiveLayer === 'function', 'archiveLayer method exists')
        assert.ok(typeof repo.getLayersForLocations === 'function', 'getLayersForLocations method exists')
    })

    test('IDescriptionRepository - addLayer returns expected shape', async () => {
        __resetDescriptionRepositoryForTests()
        const repo = await fixture.getDescriptionRepository()
        const layer: DescriptionLayer = {
            id: 'layer-1',
            locationId: 'loc-1',
            type: 'ambient',
            content: 'A cool breeze drifts through.',
            createdAt: new Date().toISOString()
        }
        const result = await repo.addLayer(layer)
        assert.ok(typeof result.created === 'boolean', 'created is boolean')
        assert.ok(result.id, 'id returned')
    })

    test('IDescriptionRepository - getLayersForLocation returns array', async () => {
        __resetDescriptionRepositoryForTests()
        const repo = await fixture.getDescriptionRepository()
        const layers = await repo.getLayersForLocation('nonexistent')
        assert.ok(Array.isArray(layers), 'returns array')
        assert.equal(layers.length, 0, 'empty for nonexistent location')
    })
})

describe('Repository Interface Type Contracts (TypeScript)', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('PlayerRecord has expected properties', async () => {
        const repo = await fixture.getPlayerRepository()
        const { record } = await repo.getOrCreate()

        // Required fields
        assert.ok(typeof record.id === 'string', 'id is string')
        assert.ok(typeof record.createdUtc === 'string', 'createdUtc is string')
        assert.ok(typeof record.guest === 'boolean', 'guest is boolean')

        // Optional fields (check type if present)
        if (record.updatedUtc !== undefined) {
            assert.ok(typeof record.updatedUtc === 'string', 'updatedUtc is string if present')
        }
        if (record.externalId !== undefined) {
            assert.ok(typeof record.externalId === 'string', 'externalId is string if present')
        }
        if (record.name !== undefined) {
            assert.ok(typeof record.name === 'string', 'name is string if present')
        }
        if (record.currentLocationId !== undefined) {
            assert.ok(typeof record.currentLocationId === 'string', 'currentLocationId is string if present')
        }
    })

    test('Location has expected structure', async () => {
        const repo = await fixture.getLocationRepository()
        const loc = await repo.get('a4d1c3f1-5b2a-4f7d-9d4b-8f0c2a6b7e21')
        if (loc) {
            assert.ok(typeof loc.id === 'string', 'id is string')
            assert.ok(typeof loc.name === 'string', 'name is string')
            assert.ok(typeof loc.description === 'string', 'description is string')
            if (loc.exits) {
                assert.ok(Array.isArray(loc.exits), 'exits is array if present')
            }
            if (loc.tags) {
                assert.ok(Array.isArray(loc.tags), 'tags is array if present')
            }
            if (loc.version !== undefined) {
                assert.ok(typeof loc.version === 'number', 'version is number if present')
            }
        }
    })

    test('DescriptionLayer has expected properties', async () => {
        __resetDescriptionRepositoryForTests()
        const repo = await fixture.getDescriptionRepository()
        const layer: DescriptionLayer = {
            id: 'test-layer-1',
            locationId: 'test-loc-1',
            type: 'structural_event',
            content: 'The gate has collapsed.',
            createdAt: new Date().toISOString(),
            attributes: { damage_level: 3 }
        }
        await repo.addLayer(layer)
        const retrieved = await repo.getLayersForLocation('test-loc-1')
        assert.equal(retrieved.length, 1)
        const retrievedLayer = retrieved[0]
        assert.ok(typeof retrievedLayer.id === 'string')
        assert.ok(typeof retrievedLayer.locationId === 'string')
        assert.ok(['structural_event', 'ambient', 'weather', 'enhancement', 'personalization'].includes(retrievedLayer.type))
        assert.ok(typeof retrievedLayer.content === 'string')
        assert.ok(typeof retrievedLayer.createdAt === 'string')
        if (retrievedLayer.attributes) {
            assert.ok(typeof retrievedLayer.attributes === 'object')
        }
    })
})
