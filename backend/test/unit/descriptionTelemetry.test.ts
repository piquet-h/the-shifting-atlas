import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { DescriptionLayer } from '../../src/repos/descriptionRepository.js'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'
import type { MockTelemetryClient } from '../mocks/MockTelemetryClient.js'

describe('Description Telemetry Events', () => {
    let fixture: UnitTestFixture
    let telemetry: MockTelemetryClient

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
        telemetry = await fixture.getTelemetryClient()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('emits Description.Generate.Start when adding a layer', async () => {
        const repo = await fixture.getDescriptionRepository()

        const locationId = randomUUID()
        const layerId = randomUUID()
        const layer: DescriptionLayer = {
            id: layerId,
            locationId,
            type: 'ambient',
            content: 'A gentle breeze rustles through the trees.',
            createdAt: new Date().toISOString()
        }

        await repo.addLayer(layer)

        const startEvent = telemetry.events.find((e) => e.name === 'Description.Generate.Start')
        assert.ok(startEvent, 'Description.Generate.Start event should be emitted')
        assert.equal(startEvent.properties?.locationId, locationId)
        assert.equal(startEvent.properties?.layerId, layerId)
        assert.equal(startEvent.properties?.layerType, 'ambient')
    })

    test('emits Description.Generate.Success on successful layer addition', async () => {
        const repo = await fixture.getDescriptionRepository()

        const locationId = randomUUID()
        const layerId = randomUUID()
        const layer: DescriptionLayer = {
            id: layerId,
            locationId,
            type: 'structural_event',
            content: 'The ancient door creaks on rusted hinges.',
            createdAt: new Date().toISOString()
        }

        const result = await repo.addLayer(layer)

        assert.equal(result.created, true)

        const successEvent = telemetry.events.find((e) => e.name === 'Description.Generate.Success')
        assert.ok(successEvent, 'Description.Generate.Success event should be emitted')
        assert.equal(successEvent.properties?.locationId, locationId)
        assert.equal(successEvent.properties?.layerId, layerId)
        assert.equal(successEvent.properties?.created, true)
        assert.equal(successEvent.properties?.contentLength, layer.content.length)
        assert.ok(typeof successEvent.properties?.durationMs === 'number')
    })

    test('emits Description.Generate.Success with created=false for duplicate layer', async () => {
        const repo = await fixture.getDescriptionRepository()

        const locationId = randomUUID()
        const layerId = randomUUID()
        const layer: DescriptionLayer = {
            id: layerId,
            locationId,
            type: 'enhancement',
            content: 'Ornate carvings adorn the walls.',
            createdAt: new Date().toISOString()
        }

        // Add layer first time
        await repo.addLayer(layer)
        telemetry.clear()

        // Add same layer again (should not create)
        const result = await repo.addLayer(layer)

        assert.equal(result.created, false)

        const successEvent = telemetry.events.find((e) => e.name === 'Description.Generate.Success')
        assert.ok(successEvent, 'Description.Generate.Success event should be emitted')
        assert.equal(successEvent.properties?.created, false)
    })

    test('emits Description.Generate.Failure for empty content', async () => {
        const repo = await fixture.getDescriptionRepository()

        const locationId = randomUUID()
        const layerId = randomUUID()
        const layer: DescriptionLayer = {
            id: layerId,
            locationId,
            type: 'ambient',
            content: '', // Empty content should fail
            createdAt: new Date().toISOString()
        }

        await assert.rejects(async () => {
            await repo.addLayer(layer)
        }, /Description content cannot be empty/)

        const failureEvent = telemetry.events.find((e) => e.name === 'Description.Generate.Failure')
        assert.ok(failureEvent, 'Description.Generate.Failure event should be emitted')
        assert.equal(failureEvent.properties?.locationId, locationId)
        assert.equal(failureEvent.properties?.layerId, layerId)
        assert.equal(failureEvent.properties?.reason, 'empty-content')
        assert.ok(typeof failureEvent.properties?.durationMs === 'number')
    })

    test('emits Description.Generate.Failure for whitespace-only content', async () => {
        const repo = await fixture.getDescriptionRepository()

        const locationId = randomUUID()
        const layerId = randomUUID()
        const layer: DescriptionLayer = {
            id: layerId,
            locationId,
            type: 'weather',
            content: '   \t\n  ', // Whitespace-only content should fail
            createdAt: new Date().toISOString()
        }

        await assert.rejects(async () => {
            await repo.addLayer(layer)
        }, /Description content cannot be empty/)

        const failureEvent = telemetry.events.find((e) => e.name === 'Description.Generate.Failure')
        assert.ok(failureEvent, 'Description.Generate.Failure event should be emitted for whitespace-only content')
        assert.equal(failureEvent.properties?.reason, 'empty-content')
    })

    test('emits Description.Cache.Miss when no layers exist for location', async () => {
        const repo = await fixture.getDescriptionRepository()

        const locationId = randomUUID()

        const layers = await repo.getLayersForLocation(locationId)

        assert.equal(layers.length, 0)

        const missEvent = telemetry.events.find((e) => e.name === 'Description.Cache.Miss')
        assert.ok(missEvent, 'Description.Cache.Miss event should be emitted')
        assert.equal(missEvent.properties?.locationId, locationId)
        assert.ok(typeof missEvent.properties?.durationMs === 'number')
    })

    test('emits Description.Cache.Hit when layers exist for location', async () => {
        const repo = await fixture.getDescriptionRepository()

        const locationId = randomUUID()
        const layer: DescriptionLayer = {
            id: randomUUID(),
            locationId,
            type: 'ambient',
            content: 'Mist hangs heavy in the air.',
            createdAt: new Date().toISOString()
        }

        // Add a layer first
        await repo.addLayer(layer)
        telemetry.clear()

        // Now retrieve layers (should hit cache)
        const layers = await repo.getLayersForLocation(locationId)

        assert.equal(layers.length, 1)

        const hitEvent = telemetry.events.find((e) => e.name === 'Description.Cache.Hit')
        assert.ok(hitEvent, 'Description.Cache.Hit event should be emitted')
        assert.equal(hitEvent.properties?.locationId, locationId)
        assert.equal(hitEvent.properties?.layerCount, 1)
        assert.ok(typeof hitEvent.properties?.durationMs === 'number')
    })

    test('emits Description.Cache.Hit with correct layer count for multiple layers', async () => {
        const repo = await fixture.getDescriptionRepository()

        const locationId = randomUUID()

        // Add multiple layers
        await repo.addLayer({
            id: randomUUID(),
            locationId,
            type: 'ambient',
            content: 'Layer 1',
            createdAt: new Date().toISOString()
        })
        await repo.addLayer({
            id: randomUUID(),
            locationId,
            type: 'weather',
            content: 'Layer 2',
            createdAt: new Date().toISOString()
        })
        await repo.addLayer({
            id: randomUUID(),
            locationId,
            type: 'enhancement',
            content: 'Layer 3',
            createdAt: new Date().toISOString()
        })

        telemetry.clear()

        // Retrieve layers
        const layers = await repo.getLayersForLocation(locationId)

        assert.equal(layers.length, 3)

        const hitEvent = telemetry.events.find((e) => e.name === 'Description.Cache.Hit')
        assert.ok(hitEvent, 'Description.Cache.Hit event should be emitted')
        assert.equal(hitEvent.properties?.layerCount, 3)
    })

    test('does not emit cache hit for archived layers', async () => {
        const repo = await fixture.getDescriptionRepository()

        const locationId = randomUUID()
        const layerId = randomUUID()
        const layer: DescriptionLayer = {
            id: layerId,
            locationId,
            type: 'ambient',
            content: 'This layer will be archived.',
            createdAt: new Date().toISOString()
        }

        // Add and then archive the layer
        await repo.addLayer(layer)
        await repo.archiveLayer(layerId)
        telemetry.clear()

        // Retrieve layers (should get cache miss since archived layers don't count)
        const layers = await repo.getLayersForLocation(locationId)

        assert.equal(layers.length, 0)

        const missEvent = telemetry.events.find((e) => e.name === 'Description.Cache.Miss')
        assert.ok(missEvent, 'Description.Cache.Miss event should be emitted for archived layers')
    })

    test('telemetry events include required fields per acceptance criteria', async () => {
        const repo = await fixture.getDescriptionRepository()

        const locationId = randomUUID()
        const layerId = randomUUID()
        const layer: DescriptionLayer = {
            id: layerId,
            locationId,
            type: 'personalization',
            content: 'A familiar landmark catches your eye.',
            createdAt: new Date().toISOString()
        }

        await repo.addLayer(layer)

        // Verify Start event has required fields
        const startEvent = telemetry.events.find((e) => e.name === 'Description.Generate.Start')
        assert.ok(startEvent, 'Start event should exist')
        assert.ok(startEvent.properties?.locationId, 'locationId should be present')
        assert.ok(startEvent.properties?.layerId, 'layerId should be present')

        // Verify Success event has required fields
        const successEvent = telemetry.events.find((e) => e.name === 'Description.Generate.Success')
        assert.ok(successEvent, 'Success event should exist')
        assert.ok(successEvent.properties?.locationId, 'locationId should be present')
        assert.ok(successEvent.properties?.layerId, 'layerId should be present')
        assert.ok(typeof successEvent.properties?.durationMs === 'number', 'durationMs should be present')
    })
})
