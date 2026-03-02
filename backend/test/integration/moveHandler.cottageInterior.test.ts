/**
 * Integration tests for on-demand cottage interior materialization
 *
 * Tests cover:
 * - No-op when location has no pending 'in' exit (returns generate error)
 * - Materialize interior on first entry: creates node, wires in/out exits, returns success
 * - Idempotency: second entry reuses the same interior (no duplicate nodes/edges)
 * - Navigation.Interior.Materialized telemetry emitted on first and repeated entry
 */
import type { HttpRequest, InvocationContext } from '@azure/functions'
import { resetExitGenerationHintStore } from '@piquet-h/shared'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { MoveHandler } from '../../src/handlers/moveCore.js'
import type { ILocationRepository } from '../../src/repos/locationRepository.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import type { MockTelemetryClient } from '../mocks/MockTelemetryClient.js'
import { makeMoveRequest } from '../helpers/testUtils.js'

// SW Cottage West - has exitAvailability.pending.in in seed data
const SW_COTTAGE_WEST_ID = '0a6c11dc-2cfd-439b-9b0d-3fd8a882ae2d'
// East Cottage North - NO exitAvailability.pending.in (used for no-op test)
const EAST_COTTAGE_NORTH_ID = '0f9efc31-4f15-4c6f-b014-31d4c1c7ec52'

describe('Cottage Interior On-Demand Materialization', () => {
    let fixture: IntegrationTestFixture
    let locationRepo: ILocationRepository

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
        locationRepo = await fixture.getLocationRepository()
        resetExitGenerationHintStore()
    })

    afterEach(async () => {
        await fixture.teardown()
        resetExitGenerationHintStore()
    })

    /** Helper to create a mock InvocationContext with container */
    async function createMockContext(): Promise<InvocationContext> {
        const container = await fixture.getContainer()
        return {
            invocationId: 'test-invocation',
            functionName: 'test-function',
            extraInputs: new Map([['container', container]]),
            log: () => {},
            error: () => {},
            warn: () => {},
            info: () => {},
            debug: () => {},
            trace: () => {}
        } as unknown as InvocationContext
    }

    test('returns generate error when location has no pending in exit', async () => {
        const ctx = await createMockContext()
        // East Cottage North has no exitAvailability.pending.in
        const req = makeMoveRequest({ dir: 'in', from: EAST_COTTAGE_NORTH_ID }) as HttpRequest

        const container = await fixture.getContainer()
        const handler = container.get(MoveHandler)
        await handler.handle(req, ctx)
        const res = await handler.performMove(req)

        assert.equal(res.success, false)
        assert.equal(res.error?.type, 'generate', 'Should return generate error (no pending in)')
    })

    test('materializes interior on first entry to cottage with pending in', async () => {
        const ctx = await createMockContext()
        const req = makeMoveRequest({ dir: 'in', from: SW_COTTAGE_WEST_ID }) as HttpRequest

        const container = await fixture.getContainer()
        const handler = container.get(MoveHandler)
        await handler.handle(req, ctx)
        const res = await handler.performMove(req)

        assert.equal(res.success, true, 'Move should succeed after materialization')
        assert.ok(res.location, 'Result should include destination location')
        assert.ok(res.location?.name?.includes('Interior'), 'Destination should be the interior location')
    })

    test('interior location has out exit back to cottage after materialization', async () => {
        const ctx = await createMockContext()
        const req = makeMoveRequest({ dir: 'in', from: SW_COTTAGE_WEST_ID }) as HttpRequest

        const container = await fixture.getContainer()
        const handler = container.get(MoveHandler)
        await handler.handle(req, ctx)
        const res = await handler.performMove(req)

        assert.equal(res.success, true)

        const interiorId = res.location?.id
        assert.ok(interiorId, 'Interior location ID must be present')

        const interior = await locationRepo.get(interiorId!)
        assert.ok(interior, 'Interior location must exist in repository')

        const outExit = interior?.exits?.find((e) => e.direction === 'out')
        assert.ok(outExit, 'Interior must have an out exit')
        assert.equal(outExit?.to, SW_COTTAGE_WEST_ID, 'out exit must point back to the cottage')
    })

    test('cottage gains hard in exit after materialization', async () => {
        const ctx = await createMockContext()
        const req = makeMoveRequest({ dir: 'in', from: SW_COTTAGE_WEST_ID }) as HttpRequest

        const container = await fixture.getContainer()
        const handler = container.get(MoveHandler)
        await handler.handle(req, ctx)
        const res = await handler.performMove(req)

        assert.equal(res.success, true)
        const interiorId = res.location?.id
        assert.ok(interiorId)

        const cottage = await locationRepo.get(SW_COTTAGE_WEST_ID)
        const inExit = cottage?.exits?.find((e) => e.direction === 'in')
        assert.ok(inExit, 'Cottage must have a hard in exit after materialization')
        assert.equal(inExit?.to, interiorId, 'in exit must point to the interior')
    })

    test('second entry is idempotent — same interior, no duplicate node', async () => {
        const ctx = await createMockContext()
        const req1 = makeMoveRequest({ dir: 'in', from: SW_COTTAGE_WEST_ID }) as HttpRequest
        const req2 = makeMoveRequest({ dir: 'in', from: SW_COTTAGE_WEST_ID }) as HttpRequest

        const container = await fixture.getContainer()
        const handler = container.get(MoveHandler)
        await handler.handle(req1, ctx)
        const res1 = await handler.performMove(req1)
        assert.equal(res1.success, true)
        const firstInteriorId = res1.location?.id

        // Second entry: interior already exists; should still succeed
        await handler.handle(req2, ctx)
        const res2 = await handler.performMove(req2)
        assert.equal(res2.success, true, 'Second entry should also succeed')
        assert.equal(res2.location?.id, firstInteriorId, 'Should arrive at the same interior')

        // World graph should have exactly one interior node for this cottage
        const allLocations = await locationRepo.listAll()
        const interiors = allLocations.filter((l) => l.id === firstInteriorId)
        assert.equal(interiors.length, 1, 'There should be exactly one interior node')
    })

    test('emits Navigation.Interior.Materialized telemetry with alreadyExisted=false on first entry', async () => {
        const ctx = await createMockContext()
        const req = makeMoveRequest({ dir: 'in', from: SW_COTTAGE_WEST_ID }) as HttpRequest

        const container = await fixture.getContainer()
        const handler = container.get(MoveHandler)
        const telemetry = container.get<MockTelemetryClient>('ITelemetryClient')
        telemetry.clear()

        await handler.handle(req, ctx)
        await handler.performMove(req)

        const event = telemetry.events.find((e) => e.name === 'Navigation.Interior.Materialized')
        assert.ok(event, 'Should emit Navigation.Interior.Materialized')
        assert.equal(event?.properties?.cottageLocationId, SW_COTTAGE_WEST_ID)
        assert.equal(event?.properties?.alreadyExisted, false)
    })

    test('second entry skips rematerialization when hard exit already exists', async () => {
        const ctx = await createMockContext()
        const req1 = makeMoveRequest({ dir: 'in', from: SW_COTTAGE_WEST_ID }) as HttpRequest
        const req2 = makeMoveRequest({ dir: 'in', from: SW_COTTAGE_WEST_ID }) as HttpRequest

        const container = await fixture.getContainer()
        const handler = container.get(MoveHandler)
        const telemetry = container.get<MockTelemetryClient>('ITelemetryClient')

        // First entry: materializes interior
        await handler.handle(req1, ctx)
        await handler.performMove(req1)

        telemetry.clear()

        // Second entry: hard exit already exists — no rematerialization needed
        await handler.handle(req2, ctx)
        const res2 = await handler.performMove(req2)

        assert.equal(res2.success, true, 'Second entry should succeed using the existing hard exit')

        // No Navigation.Interior.Materialized on second entry because hard exit already exists
        const event = telemetry.events.find((e) => e.name === 'Navigation.Interior.Materialized')
        assert.equal(event, undefined, 'Should NOT re-emit materialized event when hard exit exists')
    })

    test('world graph includes interior node after materialization', async () => {
        const ctx = await createMockContext()
        const req = makeMoveRequest({ dir: 'in', from: SW_COTTAGE_WEST_ID }) as HttpRequest

        const container = await fixture.getContainer()
        const handler = container.get(MoveHandler)
        await handler.handle(req, ctx)
        const res = await handler.performMove(req)

        assert.equal(res.success, true)
        const interiorId = res.location?.id
        assert.ok(interiorId)

        // Verify the interior is present in listAll (world graph endpoint source)
        const allLocations = await locationRepo.listAll()
        const found = allLocations.find((l) => l.id === interiorId)
        assert.ok(found, 'Interior location should appear in world graph after materialization')
        assert.ok(found?.tags?.includes('residential:cottage-interior'), 'Interior should have cottage-interior tag')
    })
})
