/**
 * Exit Generation Hint – Integration Tests
 *
 * Verifies end-to-end materialization: enqueue hint → processor runs → location shows hard exit.
 *
 * Uses IntegrationTestFixture with in-memory repositories for speed and isolation.
 */

import type { InvocationContext } from '@azure/functions'
import assert from 'node:assert/strict'
import { after, beforeEach, describe, it } from 'node:test'
import { v4 as uuidv4 } from 'uuid'
import { TOKENS } from '../../src/di/tokens.js'
import {
    __resetExitHintIdempotencyCacheForTests,
    queueProcessExitGenerationHint
} from '../../src/handlers/queueProcessExitGenerationHint.js'
import {
    ASCENT_TRAVEL_DURATION_MS,
    DEFAULT_TRAVEL_DURATION_MS,
    DESCENT_TRAVEL_DURATION_MS,
    INTERIOR_TRAVEL_DURATION_MS
} from '../../src/handlers/utils/travelDurationHeuristics.js'
import type { IExitRepository } from '../../src/repos/exitRepository.js'
import type { ILocationRepository } from '../../src/repos/locationRepository.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import { MockTelemetryClient } from '../mocks/MockTelemetryClient.js'

describe('Exit Generation Hint Integration', () => {
    let fixture: IntegrationTestFixture
    let locationRepo: ILocationRepository
    let exitRepo: IExitRepository

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        locationRepo = await fixture.getLocationRepository()
        const container = await fixture.getContainer()
        exitRepo = container.get<IExitRepository>(TOKENS.ExitRepository)
        __resetExitHintIdempotencyCacheForTests()
    })

    after(async () => {
        if (fixture) {
            await fixture.teardown()
        }
    })

    function buildHintMessage(originLocationId: string, dir: string, playerId: string): Record<string, unknown> {
        return {
            eventId: uuidv4(),
            type: 'Navigation.Exit.GenerationHint',
            occurredUtc: new Date().toISOString(),
            actor: { kind: 'player', id: playerId },
            correlationId: uuidv4(),
            idempotencyKey: `hint:${originLocationId}:${dir}:${uuidv4()}`,
            version: 1,
            payload: {
                dir,
                originLocationId,
                playerId,
                timestamp: new Date().toISOString(),
                debounced: false
            }
        }
    }

    async function snapshotLocationCount(): Promise<number> {
        return (await locationRepo.listAll()).length
    }

    async function assertLocationCountUnchanged(expectedCount: number, message: string): Promise<void> {
        assert.equal(await snapshotLocationCount(), expectedCount, message)
    }

    it('should materialize a hard exit and stub location when hint is processed', async () => {
        // Arrange: create origin location with a pending north exit
        const originId = uuidv4()
        await locationRepo.upsert({
            id: originId,
            name: 'Frontier Outpost',
            description: 'A remote outpost at the frontier',
            terrain: 'open-plain',
            tags: [],
            exits: [],
            exitAvailability: { pending: { north: '' } },
            version: 1
        })

        const ctx = await fixture.createInvocationContext()
        const message = buildHintMessage(originId, 'north', uuidv4())

        // Act
        await queueProcessExitGenerationHint(message, ctx as unknown as InvocationContext)

        // Assert: origin now has a hard north exit
        const updatedOrigin = await locationRepo.get(originId)
        assert.ok(updatedOrigin, 'Origin location should still exist')
        const northExit = updatedOrigin?.exits?.find((e) => e.direction === 'north')
        assert.ok(northExit, 'North exit should now exist as a hard exit')
        assert.ok(northExit?.to, 'Exit should point to a new stub location')

        // Assert: stub location was created
        const stubLocation = await locationRepo.get(northExit!.to!)
        assert.ok(stubLocation, 'Stub location should have been created')
        assert.equal(stubLocation?.name, 'Unexplored Open Plain', 'Stub should use terrain-aware fallback naming')
        assert.equal(stubLocation?.terrain, 'open-plain', 'Stub should inherit origin terrain')
        assert.ok(stubLocation?.description.trim().length, 'Stub should have non-empty fallback description')

        // Assert: reciprocal exit exists on the stub
        const reciprocalExit = stubLocation?.exits?.find((e) => e.direction === 'south')
        assert.ok(reciprocalExit, 'Reciprocal south exit should exist on stub')
        assert.equal(reciprocalExit?.to, originId, 'Reciprocal exit should point back to origin')

        // Assert: no errors in processing context
        assert.equal(ctx.getErrors().length, 0, 'Should have no processing errors')
    })

    it('should materialize atlas-aware stubs when origin carries macro frontier context', async () => {
        const originId = uuidv4()
        await locationRepo.upsert({
            id: originId,
            name: 'North Gate',
            description: 'A structured frontier anchor',
            terrain: 'open-plain',
            tags: [
                'settlement:mosswell',
                'frontier:boundary',
                'macro:area:lr-area-mosswell-fiordhead',
                'macro:route:mw-route-harbor-to-northgate',
                'macro:water:fjord-sound-head'
            ],
            exits: [],
            exitAvailability: { pending: { north: 'Open wilderness awaiting exploration' } },
            version: 1
        })

        const ctx = await fixture.createInvocationContext()
        await queueProcessExitGenerationHint(buildHintMessage(originId, 'north', uuidv4()), ctx as unknown as InvocationContext)

        const updatedOrigin = await locationRepo.get(originId)
        const northExit = updatedOrigin?.exits?.find((e) => e.direction === 'north')
        assert.ok(northExit?.to, 'North exit should point to a materialized stub')

        const stubLocation = await locationRepo.get(northExit!.to!)
        assert.ok(stubLocation, 'Atlas-aware stub should exist')
        assert.notEqual(
            stubLocation?.name,
            'Unexplored Region',
            'Hint path should not fall back to generic stub naming when atlas context exists'
        )
        // North from lr-area-mosswell-fiordhead crosses a ready macro-transition to lr-corridor-northgate-valley.
        // Transition-aware propagation replaces the source area tag with the destination area tag.
        assert.ok(
            stubLocation?.tags?.includes('macro:area:lr-corridor-northgate-valley'),
            'Stub should carry destination area tag after ready north transition'
        )
        assert.ok(
            !stubLocation?.tags?.includes('macro:area:lr-area-mosswell-fiordhead'),
            'Source area tag should be replaced by destination area tag'
        )
        assert.ok(stubLocation?.tags?.includes('macro:route:mw-route-harbor-to-northgate'))
        assert.ok(stubLocation?.tags?.includes('macro:water:fjord-sound-head'))
        assert.ok(stubLocation?.exitAvailability?.pending, 'Atlas-aware stub should remain frontier-expandable')
    })

    it('should clear pending availability for the materialized direction', async () => {
        // Arrange: origin with pending north AND east exits
        const originId = uuidv4()
        await locationRepo.upsert({
            id: originId,
            name: 'Junction',
            description: 'A junction with multiple pending exits',
            terrain: 'open-plain',
            tags: [],
            exits: [],
            exitAvailability: { pending: { north: '', east: '' } },
            version: 1
        })

        const ctx = await fixture.createInvocationContext()
        const message = buildHintMessage(originId, 'north', uuidv4())

        await queueProcessExitGenerationHint(message, ctx as unknown as InvocationContext)

        // Assert: north pending is cleared, east pending remains
        const updatedOrigin = await locationRepo.get(originId)
        assert.ok(updatedOrigin?.exitAvailability?.pending?.north === undefined, 'North should no longer be pending')
        assert.ok('east' in (updatedOrigin?.exitAvailability?.pending ?? {}), 'East should still be pending')
    })

    it('should reconnect to an existing nearby location when a bounded aligned candidate exists', async () => {
        const originId = uuidv4()
        const northId = uuidv4()
        const eastMidId = uuidv4()
        const eastFarId = uuidv4()
        const reconnectId = uuidv4()

        await locationRepo.upsert({
            id: originId,
            name: 'Origin Spur',
            description: 'A spur at the edge of settled ground.',
            terrain: 'open-plain',
            tags: ['settlement:mosswell'],
            exits: [],
            exitAvailability: { pending: { east: 'A path might connect back into the settled grid.' } },
            version: 1
        })
        await locationRepo.upsert({
            id: northId,
            name: 'North Link',
            description: 'A short rise north.',
            terrain: 'open-plain',
            tags: ['settlement:mosswell'],
            exits: [],
            version: 1
        })
        await locationRepo.upsert({
            id: eastMidId,
            name: 'East Mid',
            description: 'A dogleg east.',
            terrain: 'open-plain',
            tags: ['settlement:mosswell'],
            exits: [],
            version: 1
        })
        await locationRepo.upsert({
            id: eastFarId,
            name: 'East Far',
            description: 'A longer run east.',
            terrain: 'open-plain',
            tags: ['settlement:mosswell'],
            exits: [],
            version: 1
        })
        await locationRepo.upsert({
            id: reconnectId,
            name: 'Town Back Lane',
            description: 'A narrow lane reconnecting toward Mosswell.',
            terrain: 'open-plain',
            tags: ['settlement:mosswell'],
            exits: [],
            version: 1
        })

        await locationRepo.ensureExitBidirectional(originId, 'north', northId, { reciprocal: true })
        await locationRepo.ensureExitBidirectional(northId, 'east', eastMidId, { reciprocal: true })
        await locationRepo.ensureExitBidirectional(eastMidId, 'east', eastFarId, { reciprocal: true })
        await locationRepo.ensureExitBidirectional(eastFarId, 'north', reconnectId, { reciprocal: true })

        await locationRepo.setExitTravelDuration(originId, 'north', 30_000)
        await locationRepo.setExitTravelDuration(northId, 'south', 30_000)
        await locationRepo.setExitTravelDuration(northId, 'east', 30_000)
        await locationRepo.setExitTravelDuration(eastMidId, 'west', 30_000)
        await locationRepo.setExitTravelDuration(eastMidId, 'east', 30_000)
        await locationRepo.setExitTravelDuration(eastFarId, 'west', 30_000)
        await locationRepo.setExitTravelDuration(eastFarId, 'north', 30_000)
        await locationRepo.setExitTravelDuration(reconnectId, 'south', 30_000)

        const beforeCount = await snapshotLocationCount()
        const ctx = await fixture.createInvocationContext()

        await queueProcessExitGenerationHint(buildHintMessage(originId, 'east', uuidv4()), ctx as unknown as InvocationContext)

        const updatedOrigin = await locationRepo.get(originId)
        const eastExit = updatedOrigin?.exits?.find((e) => e.direction === 'east')
        assert.ok(eastExit, 'Origin should now have an east exit')
        assert.equal(eastExit?.to, reconnectId, 'Hint path should reconnect to the existing nearby location')

        const reconnectLocation = await locationRepo.get(reconnectId)
        assert.ok(
            reconnectLocation?.exits?.some((e) => e.direction === 'west' && e.to === originId),
            'Reconnected location should gain reciprocal west exit back to origin'
        )

        await assertLocationCountUnchanged(beforeCount, 'Reconnection should not create a brand new stub location')
    })

    it('should be idempotent: skip when hard exit already exists (skipped-idempotent)', async () => {
        // Arrange: origin with a hard north exit already
        const originId = uuidv4()
        const existingTargetId = uuidv4()

        await locationRepo.upsert({
            id: existingTargetId,
            name: 'Existing Destination',
            description: 'Already exists',
            tags: [],
            exits: [],
            version: 1
        })
        await locationRepo.upsert({
            id: originId,
            name: 'Origin',
            description: 'Has a hard exit',
            terrain: 'open-plain',
            tags: [],
            exits: [{ direction: 'north', to: existingTargetId }],
            version: 1
        })

        const ctx = await fixture.createInvocationContext()
        const message = buildHintMessage(originId, 'north', uuidv4())

        await queueProcessExitGenerationHint(message, ctx as unknown as InvocationContext)

        // Assert: only one north exit exists, still pointing to original target
        const updatedOrigin = await locationRepo.get(originId)
        const northExits = updatedOrigin?.exits?.filter((e) => e.direction === 'north')
        assert.equal(northExits?.length, 1, 'Should have exactly one north exit')
        assert.equal(northExits?.[0]?.to, existingTargetId, 'Exit should still point to original target')

        // Assert: no errors
        assert.equal(ctx.getErrors().length, 0, 'Should have no errors for idempotent skip')

        // Assert: idempotent skip log
        const skipLog = ctx.getLogs().find((l) => l[0] === 'Exit generation hint: hard exit already exists, skipping (idempotent)')
        assert.ok(skipLog, 'Should log idempotent skip')
    })

    it('should allow retry after transient materialization failure using integration container wiring', async () => {
        const originId = uuidv4()
        await locationRepo.upsert({
            id: originId,
            name: 'Retry Ridge',
            description: 'A location used to verify replay after transient failure.',
            terrain: 'open-plain',
            tags: [],
            exits: [],
            exitAvailability: { pending: { north: '' } },
            version: 1
        })

        const originalEnsureExitBidirectional = locationRepo.ensureExitBidirectional.bind(locationRepo)
        let invocationCount = 0
        locationRepo.ensureExitBidirectional = async (...args) => {
            invocationCount += 1
            if (invocationCount === 1) {
                throw new Error('integration transient exit materialization failure')
            }
            return originalEnsureExitBidirectional(...args)
        }

        const message = buildHintMessage(originId, 'north', uuidv4())
        const ctx1 = await fixture.createInvocationContext()
        const ctx2 = await fixture.createInvocationContext()

        await assert.rejects(
            () => queueProcessExitGenerationHint(message, ctx1 as unknown as InvocationContext),
            /integration transient exit materialization failure/
        )

        const afterFailure = await locationRepo.get(originId)
        assert.ok(!afterFailure?.exits?.some((e) => e.direction === 'north'), 'Failed first attempt should not leave a hard exit behind')

        await assert.doesNotReject(() => queueProcessExitGenerationHint(message, ctx2 as unknown as InvocationContext))

        assert.equal(invocationCount, 2, 'Retry should invoke materialization a second time')

        const updatedOrigin = await locationRepo.get(originId)
        const northExit = updatedOrigin?.exits?.find((e) => e.direction === 'north')
        assert.ok(northExit?.to, 'Successful retry should materialize the hard north exit')

        const successLog = ctx2.getLogs().find((l) => l[0] === 'Exit generation hint materialized')
        assert.ok(successLog, 'Retry should eventually log successful materialization')
    })

    it('should not create exit when direction is forbidden by policy', async () => {
        // Arrange: origin with a forbidden north direction
        const originId = uuidv4()
        await locationRepo.upsert({
            id: originId,
            name: 'Dead End',
            description: 'Blocked to the north',
            terrain: 'open-plain',
            tags: [],
            exits: [],
            exitAvailability: { forbidden: { north: 'wall' } },
            version: 1
        })

        // Count locations before to verify no new one is created
        const beforeCount = await snapshotLocationCount()

        const ctx = await fixture.createInvocationContext()
        const message = buildHintMessage(originId, 'north', uuidv4())

        await queueProcessExitGenerationHint(message, ctx as unknown as InvocationContext)

        // Assert: no north exit created
        const updatedOrigin = await locationRepo.get(originId)
        const northExit = updatedOrigin?.exits?.find((e) => e.direction === 'north')
        assert.ok(!northExit, 'No north exit should be created for forbidden direction')

        // Assert: no new location created
        await assertLocationCountUnchanged(beforeCount, 'No new locations should be created for forbidden direction')

        // Assert: forbidden-policy log
        const forbiddenLog = ctx.getLogs().find((l) => l[0] === 'Exit generation hint: direction is forbidden by policy')
        assert.ok(forbiddenLog, 'Should log forbidden-policy outcome')
    })

    it('should DLQ and emit failed-validation when origin location does not exist', async () => {
        // Use a non-existent origin ID
        const nonExistentOriginId = uuidv4()

        const ctx = await fixture.createInvocationContext()
        const message = buildHintMessage(nonExistentOriginId, 'north', uuidv4())

        await queueProcessExitGenerationHint(message, ctx as unknown as InvocationContext)

        // Assert: error logged for missing origin
        const errorLog = ctx.getErrors().find((e) => e[0] === 'Exit generation hint: origin location not found')
        assert.ok(errorLog, 'Should log missing origin error')

        // Assert: DLQ record created
        const dlqLog = ctx.getLogs().find((l) => l[0] === 'Dead-letter record created for exit hint')
        assert.ok(dlqLog, 'Should create a DLQ record for missing origin')
    })

    it('should persist travelDurationMs on forward and reciprocal exits after materialization (north → DEFAULT)', async () => {
        const originId = uuidv4()
        await locationRepo.upsert({
            id: originId,
            name: 'Meadow Edge',
            description: '',
            terrain: 'open-plain',
            tags: [],
            exits: [],
            exitAvailability: { pending: { north: '' } },
            version: 1
        })

        const ctx = await fixture.createInvocationContext()
        await queueProcessExitGenerationHint(buildHintMessage(originId, 'north', uuidv4()), ctx as unknown as InvocationContext)

        // Forward exit: origin → north
        const originExits = await exitRepo.getExits(originId)
        const northExit = originExits.find((e) => e.direction === 'north')
        assert.ok(northExit, 'North exit should exist')
        assert.equal(northExit!.travelDurationMs, DEFAULT_TRAVEL_DURATION_MS, 'North exit should have default travel duration')

        // Reciprocal: stub → south
        const northExitTarget = northExit!.toLocationId
        const stubExits = await exitRepo.getExits(northExitTarget)
        const southExit = stubExits.find((e) => e.direction === 'south')
        assert.ok(southExit, 'Reciprocal south exit should exist on stub')
        assert.equal(southExit!.travelDurationMs, DEFAULT_TRAVEL_DURATION_MS, 'Reciprocal south exit should have default travel duration')
    })

    it('should persist short INTERIOR_TRAVEL_DURATION_MS for in/out exits', async () => {
        const originId = uuidv4()
        await locationRepo.upsert({
            id: originId,
            name: 'Doorway',
            description: '',
            terrain: 'open-plain',
            tags: [],
            exits: [],
            exitAvailability: { pending: { in: '' } },
            version: 1
        })

        const ctx = await fixture.createInvocationContext()
        await queueProcessExitGenerationHint(buildHintMessage(originId, 'in', uuidv4()), ctx as unknown as InvocationContext)

        const originExits = await exitRepo.getExits(originId)
        const inExit = originExits.find((e) => e.direction === 'in')
        assert.ok(inExit, 'in exit should exist')
        assert.equal(inExit!.travelDurationMs, INTERIOR_TRAVEL_DURATION_MS, 'in exit should have interior travel duration')

        const stubExits = await exitRepo.getExits(inExit!.toLocationId)
        const outExit = stubExits.find((e) => e.direction === 'out')
        assert.ok(outExit, 'Reciprocal out exit should exist')
        assert.equal(outExit!.travelDurationMs, INTERIOR_TRAVEL_DURATION_MS, 'out exit should have interior travel duration')
    })

    it('should drop in-direction hint from an interior location without creating any exit', async () => {
        // Regression guard for the "Common Room → Unexplored Open Plain" bug:
        // when a queued hint requests dir=in from a location that already has an 'out' exit
        // (i.e. is an interior), the processor must silently drop it.
        const interiorId = uuidv4()
        const exteriorId = uuidv4()
        await locationRepo.upsert({
            id: exteriorId,
            name: 'Tavern Exterior',
            description: 'A door to a common room.',
            terrain: 'open-plain',
            tags: [],
            exits: [{ direction: 'in', to: interiorId }],
            version: 1
        })
        await locationRepo.upsert({
            id: interiorId,
            name: 'Common Room',
            description: 'Low rafters and warm light.',
            terrain: 'open-plain',
            tags: [],
            exits: [{ direction: 'out', to: exteriorId }],
            exitAvailability: { pending: {} },
            version: 1
        })

        const beforeCount = await snapshotLocationCount()
        const ctx = await fixture.createInvocationContext()
        const message = buildHintMessage(interiorId, 'in', uuidv4())

        // Should complete without throwing
        await queueProcessExitGenerationHint(message, ctx as unknown as InvocationContext)

        // No new location should have been created
        await assertLocationCountUnchanged(beforeCount, 'Interior in-exit hint must not create a stub location')

        // The interior's exit list must still only contain 'out' (no new 'in' wired)
        const interior = await locationRepo.get(interiorId)
        const inExit = interior?.exits?.find((e) => e.direction === 'in')
        assert.equal(inExit, undefined, 'Interior must not gain an in exit via hint processing')
    })

    it('should persist ASCENT_TRAVEL_DURATION_MS for up exits and DESCENT_TRAVEL_DURATION_MS for down exits', async () => {
        const originUpId = uuidv4()
        const originDownId = uuidv4()
        await locationRepo.upsert({
            id: originUpId,
            name: 'Cliff Base',
            description: '',
            terrain: 'open-plain',
            tags: [],
            exits: [],
            exitAvailability: { pending: { up: '' } },
            version: 1
        })
        await locationRepo.upsert({
            id: originDownId,
            name: 'Cliff Top',
            description: '',
            terrain: 'open-plain',
            tags: [],
            exits: [],
            exitAvailability: { pending: { down: '' } },
            version: 1
        })

        const ctx = await fixture.createInvocationContext()
        await queueProcessExitGenerationHint(buildHintMessage(originUpId, 'up', uuidv4()), ctx as unknown as InvocationContext)
        __resetExitHintIdempotencyCacheForTests()
        await queueProcessExitGenerationHint(buildHintMessage(originDownId, 'down', uuidv4()), ctx as unknown as InvocationContext)

        const upExits = await exitRepo.getExits(originUpId)
        const upExit = upExits.find((e) => e.direction === 'up')
        assert.ok(upExit, 'up exit should exist')
        assert.equal(upExit!.travelDurationMs, ASCENT_TRAVEL_DURATION_MS, 'up exit should be slow (ascent)')

        const downExits = await exitRepo.getExits(originDownId)
        const downExit = downExits.find((e) => e.direction === 'down')
        assert.ok(downExit, 'down exit should exist')
        assert.equal(downExit!.travelDurationMs, DESCENT_TRAVEL_DURATION_MS, 'down exit should be fast (descent)')
    })

    // -----------------------------------------------------------------------
    // Macro-area transition: repeated travel and blocked authoring boundaries
    // -----------------------------------------------------------------------

    it('should propagate destination area tag through repeated frontier travel into a ready area', async () => {
        // First travel: origin in lr-area-mosswell-fiordhead → north → stub1 in lr-corridor-northgate-valley.
        // North from lr-area-mosswell-fiordhead is a ready macro-transition so the stub1 gains
        // the destination area tag.  stub1 also gains pending exits so further travel is possible.
        const originId = uuidv4()
        await locationRepo.upsert({
            id: originId,
            name: 'Northern Gate Outpost',
            description: 'A fortified outpost at the northern edge of the basin',
            terrain: 'open-plain',
            tags: [
                'settlement:mosswell',
                'macro:area:lr-area-mosswell-fiordhead',
                'macro:route:mw-route-harbor-to-northgate',
                'macro:water:fjord-sound-head'
            ],
            exits: [],
            exitAvailability: { pending: { north: 'The road continues north through the valley mouth' } },
            version: 1
        })

        const ctx1 = await fixture.createInvocationContext()
        await queueProcessExitGenerationHint(buildHintMessage(originId, 'north', uuidv4()), ctx1 as unknown as InvocationContext)

        const updatedOrigin = await locationRepo.get(originId)
        const northExit = updatedOrigin?.exits?.find((e) => e.direction === 'north')
        assert.ok(northExit?.to, 'First north exit should be materialized after ready transition')

        const stub1 = await locationRepo.get(northExit!.to!)
        assert.ok(stub1, 'stub1 should exist in the ready destination area')
        assert.ok(
            stub1?.tags?.includes('macro:area:lr-corridor-northgate-valley'),
            'stub1 must carry the destination area tag after ready north transition'
        )
        assert.ok(stub1?.exitAvailability?.pending, 'stub1 must have pending exits so further travel is possible')

        // Second travel: from stub1 (lr-corridor-northgate-valley) → north → stub2.
        // There is no outbound macro-transition edge from lr-corridor-northgate-valley going north,
        // so the area tag stays (stay-in-area outcome) and stub2 inherits lr-corridor-northgate-valley.
        const ctx2 = await fixture.createInvocationContext()
        await queueProcessExitGenerationHint(buildHintMessage(stub1!.id, 'north', uuidv4()), ctx2 as unknown as InvocationContext)

        const updatedStub1 = await locationRepo.get(stub1!.id)
        const stub1NorthExit = updatedStub1?.exits?.find((e) => e.direction === 'north')
        assert.ok(stub1NorthExit?.to, 'Second north exit should be materialized from stub1')

        const stub2 = await locationRepo.get(stub1NorthExit!.to!)
        assert.ok(stub2, 'stub2 should exist')
        assert.ok(
            stub2?.tags?.includes('macro:area:lr-corridor-northgate-valley'),
            'stub2 must carry lr-corridor-northgate-valley area tag: area persists through repeated travel in a ready destination'
        )
        assert.ok(stub2?.exitAvailability?.pending, 'stub2 must remain expandable (ready destination area)')
    })

    it('should create blocked boundary stub with no pending exits, stopping generic continuation on repeated travel', async () => {
        // First travel: origin in lr-area-mosswell-fiordhead → west → blocked boundary stub.
        // West from lr-area-mosswell-fiordhead is blocked (lr-area-fiordmarch-west); the generated
        // stub must carry NO pending exits so batch generation never fans out from it.
        const originId = uuidv4()
        await locationRepo.upsert({
            id: originId,
            name: 'Western Cliffside',
            description: 'The cliffs drop steeply to the fiordmarch below',
            terrain: 'open-plain',
            tags: ['macro:area:lr-area-mosswell-fiordhead', 'macro:water:fjord-sound-head'],
            exits: [],
            exitAvailability: { pending: { west: 'Rocky clifftop path toward the fiordmarch' } },
            version: 1
        })

        const ctx1 = await fixture.createInvocationContext()
        await queueProcessExitGenerationHint(buildHintMessage(originId, 'west', uuidv4()), ctx1 as unknown as InvocationContext)

        const updatedOrigin = await locationRepo.get(originId)
        const westExit = updatedOrigin?.exits?.find((e) => e.direction === 'west')
        assert.ok(westExit?.to, 'West exit should be materialized to a blocked boundary stub')

        const blockedStub = await locationRepo.get(westExit!.to!)
        assert.ok(blockedStub, 'Blocked boundary stub should exist')

        // Blocked boundary stub must have NO pending exits — this stops further batch generation hints.
        assert.equal(
            blockedStub?.exitAvailability?.pending,
            undefined,
            'Blocked boundary stub must have no pending exits, stopping further frontier generation'
        )
        // Blocked boundary stub must retain the source area tag (not gain the blocked destination tag).
        assert.ok(
            blockedStub?.tags?.includes('macro:area:lr-area-mosswell-fiordhead'),
            'Blocked stub must retain source area tag (lr-area-mosswell-fiordhead)'
        )
        assert.ok(
            !blockedStub?.tags?.includes('macro:area:lr-area-fiordmarch-west'),
            'Blocked stub must NOT carry the blocked destination area tag'
        )

        // Second hint from the blocked stub: the processor should produce another blocked boundary stub
        // (not a generic overland location), demonstrating the blocked boundary behavior is deterministic
        // across repeated traversal attempts in the same direction.
        const ctx2 = await fixture.createInvocationContext()
        await queueProcessExitGenerationHint(buildHintMessage(blockedStub!.id, 'west', uuidv4()), ctx2 as unknown as InvocationContext)

        const updatedBlockedStub = await locationRepo.get(blockedStub!.id)
        const stub2WestExit = updatedBlockedStub?.exits?.find((e) => e.direction === 'west')
        assert.ok(stub2WestExit?.to, 'Second west hint must produce a new stub from the blocked boundary')

        const stub2 = await locationRepo.get(stub2WestExit!.to!)
        assert.ok(stub2, 'stub2 should exist')
        assert.equal(
            stub2?.exitAvailability?.pending,
            undefined,
            'Second-generation west stub must also be a blocked boundary stub with no pending exits'
        )
        // stub2 must NOT be a generic overland location — the boundary filter must apply consistently.
        assert.ok(
            stub2?.name !== 'Unexplored Open Plain' && stub2?.name !== 'Unexplored Narrow Corridor',
            `Second stub must not be a generic overland location, got name: "${stub2?.name}"`
        )
    })

    // -----------------------------------------------------------------------
    // Authoring-boundary telemetry: BoundaryReached and BoundaryApproach
    // -----------------------------------------------------------------------

    it('should emit World.Frontier.BoundaryReached telemetry when a blocked boundary stub is materialized', async () => {
        const container = await fixture.getContainer()
        const mockTelemetry = container.get<MockTelemetryClient>(TOKENS.TelemetryClient)
        mockTelemetry.clear()

        const originId = uuidv4()
        await locationRepo.upsert({
            id: originId,
            name: 'Western Cliffside Watch',
            description: 'A lookout point on the clifftop toward the fiordmarch',
            terrain: 'open-plain',
            tags: ['macro:area:lr-area-mosswell-fiordhead', 'macro:water:fjord-sound-head'],
            exits: [],
            exitAvailability: { pending: { west: 'Rocky clifftop path toward the fiordmarch' } },
            version: 1
        })

        const ctx = await fixture.createInvocationContext()
        await queueProcessExitGenerationHint(buildHintMessage(originId, 'west', uuidv4()), ctx as unknown as InvocationContext)

        const boundaryEvent = mockTelemetry.events.find((e) => e.name === 'World.Frontier.BoundaryReached')
        assert.ok(boundaryEvent, 'World.Frontier.BoundaryReached event should be emitted')
        assert.equal(
            boundaryEvent.properties.sourceAreaRef,
            'lr-area-mosswell-fiordhead',
            'sourceAreaRef should identify the source atlas area'
        )
        assert.equal(boundaryEvent.properties.dir, 'west', 'dir should be the expansion direction')
        assert.equal(
            boundaryEvent.properties.destinationAreaRef,
            'lr-area-fiordmarch-west',
            'destinationAreaRef should identify the blocked destination area'
        )
        assert.equal(
            boundaryEvent.properties.destinationReadiness,
            'blocked',
            'destinationReadiness should be blocked'
        )
        assert.equal(
            boundaryEvent.properties.entrySegmentRef,
            'lr-corridor-westwall-shelf',
            'entrySegmentRef should carry the authored entry segment for the blocked area'
        )
        // BoundaryApproach must NOT be emitted for a boundary stub (no pending exits to check).
        const approachEvent = mockTelemetry.events.find((e) => e.name === 'World.Frontier.BoundaryApproach')
        assert.equal(approachEvent, undefined, 'World.Frontier.BoundaryApproach should NOT be emitted for a boundary stub')
    })

    it('should emit World.Frontier.BoundaryApproach telemetry when a non-boundary stub has pending exits toward a blocked transition', async () => {
        const container = await fixture.getContainer()
        const mockTelemetry = container.get<MockTelemetryClient>(TOKENS.TelemetryClient)
        mockTelemetry.clear()

        // Create origin in lr-area-mosswell-fiordhead with a northwest pending exit.
        // Northwest has no authored macro-transition edge from this area, so the new stub
        // stays in lr-area-mosswell-fiordhead and inherits its pending exit directions
        // (north, south, east, west for open-plain terrain).
        // West from lr-area-mosswell-fiordhead is blocked → BoundaryApproach must fire for west.
        const originId = uuidv4()
        await locationRepo.upsert({
            id: originId,
            name: 'Northwest Uplands',
            description: 'A highland ridge with views toward the fiordmarch',
            terrain: 'open-plain',
            tags: ['macro:area:lr-area-mosswell-fiordhead'],
            exits: [],
            exitAvailability: { pending: { northwest: 'Upland path continues northwest' } },
            version: 1
        })

        const ctx = await fixture.createInvocationContext()
        await queueProcessExitGenerationHint(buildHintMessage(originId, 'northwest', uuidv4()), ctx as unknown as InvocationContext)

        // BoundaryReached must NOT be emitted: the northwest expansion has no blocked transition.
        const reachedEvent = mockTelemetry.events.find((e) => e.name === 'World.Frontier.BoundaryReached')
        assert.equal(reachedEvent, undefined, 'World.Frontier.BoundaryReached should NOT be emitted for a non-boundary stub')

        // BoundaryApproach must be emitted for west (blocked → lr-area-fiordmarch-west).
        const approachEvents = mockTelemetry.events.filter((e) => e.name === 'World.Frontier.BoundaryApproach')
        assert.ok(approachEvents.length > 0, 'At least one World.Frontier.BoundaryApproach event should be emitted')

        const westApproach = approachEvents.find((e) => e.properties.approachDir === 'west')
        assert.ok(westApproach, 'BoundaryApproach should be emitted for approach direction west')
        assert.equal(
            westApproach.properties.sourceAreaRef,
            'lr-area-mosswell-fiordhead',
            'sourceAreaRef should identify the area the new stub lives in'
        )
        assert.equal(
            westApproach.properties.destinationAreaRef,
            'lr-area-fiordmarch-west',
            'destinationAreaRef should identify the blocked destination area'
        )
        assert.equal(
            westApproach.properties.destinationReadiness,
            'blocked',
            'destinationReadiness should be blocked'
        )
    })

    it('should not emit boundary telemetry when a blocked boundary hint is a duplicate (idempotent path)', async () => {
        const container = await fixture.getContainer()
        const mockTelemetry = container.get<MockTelemetryClient>(TOKENS.TelemetryClient)

        const originId = uuidv4()
        await locationRepo.upsert({
            id: originId,
            name: 'Western Boundary Approach',
            description: 'The western approach to the fiordmarch',
            terrain: 'open-plain',
            tags: ['macro:area:lr-area-mosswell-fiordhead'],
            exits: [],
            exitAvailability: { pending: { west: 'Cliffs drop toward the fiordmarch' } },
            version: 1
        })

        // First hint: creates the blocked boundary stub and emits BoundaryReached.
        const ctx1 = await fixture.createInvocationContext()
        await queueProcessExitGenerationHint(buildHintMessage(originId, 'west', uuidv4()), ctx1 as unknown as InvocationContext)

        const firstBoundaryEvents = mockTelemetry.events.filter((e) => e.name === 'World.Frontier.BoundaryReached')
        assert.equal(firstBoundaryEvents.length, 1, 'Exactly one BoundaryReached event on first hint')

        // Second hint for the same origin+direction: hard exit already exists → skipped-idempotent.
        // No new stub is created, so no BoundaryReached should be emitted again.
        mockTelemetry.clear()
        const ctx2 = await fixture.createInvocationContext()
        await queueProcessExitGenerationHint(buildHintMessage(originId, 'west', uuidv4()), ctx2 as unknown as InvocationContext)

        const secondBoundaryEvents = mockTelemetry.events.filter((e) => e.name === 'World.Frontier.BoundaryReached')
        assert.equal(secondBoundaryEvents.length, 0, 'No BoundaryReached event on idempotent retry (exit already exists)')
    })
})
