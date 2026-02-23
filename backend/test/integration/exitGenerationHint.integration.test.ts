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
import {
    __resetExitHintIdempotencyCacheForTests,
    queueProcessExitGenerationHint
} from '../../src/handlers/queueProcessExitGenerationHint.js'
import type { ILocationRepository } from '../../src/repos/locationRepository.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describe('Exit Generation Hint Integration', () => {
    let fixture: IntegrationTestFixture
    let locationRepo: ILocationRepository

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        locationRepo = await fixture.getLocationRepository()
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
        assert.equal(stubLocation?.name, 'Unexplored Region', 'Stub should have placeholder name')
        assert.equal(stubLocation?.terrain, 'open-plain', 'Stub should inherit origin terrain')

        // Assert: reciprocal exit exists on the stub
        const reciprocalExit = stubLocation?.exits?.find((e) => e.direction === 'south')
        assert.ok(reciprocalExit, 'Reciprocal south exit should exist on stub')
        assert.equal(reciprocalExit?.to, originId, 'Reciprocal exit should point back to origin')

        // Assert: no errors in processing context
        assert.equal(ctx.getErrors().length, 0, 'Should have no processing errors')
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
        const beforeLocations = await locationRepo.listAll()
        const beforeCount = beforeLocations.length

        const ctx = await fixture.createInvocationContext()
        const message = buildHintMessage(originId, 'north', uuidv4())

        await queueProcessExitGenerationHint(message, ctx as unknown as InvocationContext)

        // Assert: no north exit created
        const updatedOrigin = await locationRepo.get(originId)
        const northExit = updatedOrigin?.exits?.find((e) => e.direction === 'north')
        assert.ok(!northExit, 'No north exit should be created for forbidden direction')

        // Assert: no new location created
        const afterLocations = await locationRepo.listAll()
        assert.equal(afterLocations.length, beforeCount, 'No new locations should be created for forbidden direction')

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
})
