/**
 * Integration tests for Layer Repository
 * Tests repository operations with dependency injection container
 */

import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describe('Layer Repository Integration', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('setLayerForLocation persists a loc:<id> scoped layer', async () => {
        const repo = await fixture.getLayerRepository()
        const locationId = crypto.randomUUID()

        const created = await repo.setLayerForLocation(locationId, 'dynamic', 0, null, 'A sudden hush falls over the hall.', {
            role: 'hero',
            replacesBase: true,
            promptHash: 'test'
        })

        assert.ok(created.id)
        assert.strictEqual(created.scopeId, `loc:${locationId}`)
        assert.strictEqual(created.layerType, 'dynamic')
        assert.strictEqual(created.value, 'A sudden hush falls over the hall.')
        assert.strictEqual(created.effectiveFromTick, 0)
        assert.strictEqual(created.effectiveToTick, null)
        assert.ok(created.authoredAt)
        assert.strictEqual((created.metadata as Record<string, unknown> | undefined)?.role, 'hero')
    })

    test('queryLayerHistory returns layers ordered by effectiveFromTick ascending', async () => {
        const repo = await fixture.getLayerRepository()
        const locationId = crypto.randomUUID()
        const scopeId = `loc:${locationId}`

        await repo.setLayerForLocation(locationId, 'ambient', 10, null, 'A cold wind whispers.')
        await repo.setLayerForLocation(locationId, 'ambient', 0, 9, 'Warm candlelight lingers.')

        const history = await repo.queryLayerHistory(scopeId, 'ambient')
        assert.strictEqual(history.length, 2)
        assert.strictEqual(history[0].effectiveFromTick, 0)
        assert.strictEqual(history[1].effectiveFromTick, 10)
    })

    test('getActiveLayer returns the most recently authored layer when multiple are active', async () => {
        const repo = await fixture.getLayerRepository()
        const locationId = crypto.randomUUID()
        const scopeId = `loc:${locationId}`

        const first = await repo.setLayerForLocation(locationId, 'dynamic', 0, null, 'First.')
        const second = await repo.setLayerForLocation(locationId, 'dynamic', 0, null, 'Second.')

        // Both are active at tick 0; repository policy is "most recently authored wins".
        const active = await repo.getActiveLayer(scopeId, 'dynamic', 0)
        assert.ok(active)
        assert.strictEqual(active.id, second.id)
        assert.notStrictEqual(active.id, first.id)
    })

    test('deleteLayer removes a layer by (id, scopeId)', async () => {
        const repo = await fixture.getLayerRepository()
        const locationId = crypto.randomUUID()
        const scopeId = `loc:${locationId}`

        const created = await repo.setLayerForLocation(locationId, 'ambient', 0, null, 'Faint music drifts in.')

        const deleted = await repo.deleteLayer(created.id, scopeId)
        assert.strictEqual(deleted, true)

        const history = await repo.queryLayerHistory(scopeId, 'ambient')
        assert.strictEqual(history.length, 0)
    })
})
