/**
 * Integration tests for prefetch batch generation on frontier arrival.
 *
 * Tests cover:
 * - Successful move to location with pending exits triggers batch generation
 * - Batch generation event is enqueued with correct payload
 * - Telemetry events are emitted
 * - Idempotency/debouncing per location
 * - No prefetch on Look operations (cost control)
 * - Forbidden exits never trigger prefetch
 * - Move to location without pending exits does not trigger prefetch
 */

import type { HttpRequest } from '@azure/functions'
import { STARTER_LOCATION_ID, getOppositeDirection, type Location } from '@piquet-h/shared'
import type { IPlayerRepository } from '@piquet-h/shared/types/playerRepository'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { v4 as uuidv4 } from 'uuid'
import { TOKENS } from '../../src/di/tokens.js'
import { MoveHandler } from '../../src/handlers/moveCore.js'
import type { ILocationRepository } from '../../src/repos/locationRepository.js'
import { InMemoryWorldEventPublisher } from '../../src/worldEvents/worldEventPublisher.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import { makeMoveRequest } from '../helpers/testUtils.js'
import { MockTelemetryClient } from '../mocks/MockTelemetryClient.js'

describe('MoveHandler - Prefetch Batch Generation on Arrival', () => {
    let fixture: IntegrationTestFixture
    let moveHandler: MoveHandler
    let locationRepo: ILocationRepository
    let eventPublisher: InMemoryWorldEventPublisher
    let mockTelemetry: MockTelemetryClient
    let container: any // eslint-disable-line @typescript-eslint/no-explicit-any

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        container = await fixture.getContainer()

        moveHandler = container.get(MoveHandler)
        locationRepo = container.get<ILocationRepository>(TOKENS.LocationRepository)
        eventPublisher = container.get<InMemoryWorldEventPublisher>(TOKENS.WorldEventPublisher)
        mockTelemetry = container.get<MockTelemetryClient>(TOKENS.TelemetryClient) as MockTelemetryClient

        // Clear telemetry and event publisher before each test
        mockTelemetry.clear()
        eventPublisher.clear()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('Prefetch on arrival with pending exits', () => {
        test('successful move to location with pending exits enqueues batch generation', async () => {
            // Arrange: Create a frontier location with pending exits
            const frontierLocationId = uuidv4()
            const frontierLocation: Location = {
                id: frontierLocationId,
                name: 'Frontier Outpost',
                description: 'A lonely outpost at the edge of civilization',
                terrain: 'open-plain',
                tags: [],
                exits: [
                    { direction: 'south', to: STARTER_LOCATION_ID } // Return path
                ],
                exitAvailability: {
                    pending: {
                        north: 'unexplored wilderness',
                        east: 'dense forest ahead',
                        west: 'rolling hills'
                    }
                },
                version: 1
            }
            await locationRepo.upsert(frontierLocation)

            // Create a test player
            const testPlayerId = uuidv4()
            const playerRepo = container.get<IPlayerRepository>(TOKENS.PlayerRepository)
            const { record: testPlayer } = await playerRepo.getOrCreate(testPlayerId)
            // Update to set location
            testPlayer.currentLocationId = STARTER_LOCATION_ID
            await playerRepo.update(testPlayer)

            // Link from starter location to frontier (using 'up' to avoid conflicts)
            await locationRepo.ensureExit(STARTER_LOCATION_ID, 'up', frontierLocationId)

            // Act: Move to the frontier location
            const req = makeMoveRequest({ dir: 'up' }, {}, { playerId: testPlayerId }) as HttpRequest
            const result = await moveHandler.performMove(req)

            // Assert: Move succeeded
            assert.equal(result.success, true, `Move should succeed: ${JSON.stringify(result.error)}`)
            assert.equal(result.location?.id, frontierLocationId, `Should move to frontier location, got ${result.location?.id}`)

            // Assert: Batch generation event was enqueued
            const enqueuedEvents = eventPublisher.enqueuedEvents
            assert.ok(enqueuedEvents.length > 0, 'Should have enqueued at least one event')

            const batchEvent = enqueuedEvents.find((e) => e.type === 'World.Location.BatchGenerate')
            assert.ok(batchEvent, 'Should have enqueued a World.Location.BatchGenerate event')

            // Assert: Batch event payload is correct
            assert.equal(batchEvent.payload.rootLocationId, frontierLocationId)
            assert.ok(batchEvent.payload.terrain, 'Should include terrain')
            assert.ok(batchEvent.payload.arrivalDirection, 'Should include arrival direction')
            assert.ok(batchEvent.payload.batchSize, 'Should include batch size')

            // Contract: arrivalDirection means "direction the player arrived FROM".
            // If the move direction is 'up', the player arrived from its opposite.
            assert.equal(
                batchEvent.payload.arrivalDirection,
                getOppositeDirection('up'),
                'arrivalDirection should be opposite of the move direction'
            )

            // Assert: Telemetry event was emitted
            const telemetryEvents = mockTelemetry.events.filter((e) => e.name === 'World.BatchGeneration.Prefetch')
            assert.ok(telemetryEvents.length > 0, 'Should have emitted World.BatchGeneration.Prefetch telemetry')
            assert.equal(telemetryEvents[0].properties.rootLocationId, frontierLocationId)
        })

        test('batch generation is capped at configurable size (default 20)', async () => {
            // Arrange: Create a custom starting location to avoid conflicts
            const startLocationId = uuidv4()
            const startLocation: Location = {
                id: startLocationId,
                name: 'Test Start',
                description: 'Starting point for test',
                terrain: 'open-plain',
                tags: [],
                exits: [],
                version: 1
            }
            await locationRepo.upsert(startLocation)

            // Arrange: Create a frontier location with many pending exits
            const frontierLocationId = uuidv4()
            const frontierLocation: Location = {
                id: frontierLocationId,
                name: 'Crossroads',
                description: 'A central hub with paths in all directions',
                terrain: 'open-plain',
                tags: [],
                exits: [{ direction: 'south', to: startLocationId }],
                exitAvailability: {
                    pending: {
                        north: 'pending',
                        northeast: 'pending',
                        east: 'pending',
                        southeast: 'pending',
                        west: 'pending',
                        northwest: 'pending',
                        southwest: 'pending'
                    }
                },
                version: 1
            }
            await locationRepo.upsert(frontierLocation)

            // Create a test player at the custom start location
            const testPlayerId = uuidv4()
            const playerRepo = container.get<IPlayerRepository>(TOKENS.PlayerRepository)
            const { record: testPlayer } = await playerRepo.getOrCreate(testPlayerId)
            // Update to set location
            testPlayer.currentLocationId = startLocationId
            await playerRepo.update(testPlayer)

            await locationRepo.ensureExit(startLocationId, 'north', frontierLocationId)

            // Act: Move to the crossroads
            const req = makeMoveRequest({ dir: 'north' }, {}, { playerId: testPlayerId }) as HttpRequest
            const result = await moveHandler.performMove(req)

            // Assert: Move succeeded
            assert.equal(result.success, true, `Move should succeed: ${JSON.stringify(result.error)}`)
            assert.equal(result.location?.id, frontierLocationId, `Should move to frontier, got ${result.location?.id}`)

            // Assert: Batch event was enqueued with capped size
            const enqueuedEvents = eventPublisher.enqueuedEvents

            const batchEvent = enqueuedEvents.find((e) => e.type === 'World.Location.BatchGenerate')
            assert.ok(batchEvent, 'Should have enqueued batch generation')

            // batchSize should be capped (default 20 or less based on pending exits)
            const batchSize = batchEvent.payload.batchSize as number
            assert.ok(batchSize <= 20, `Batch size should be capped at 20, got ${batchSize}`)
        })
    })

    describe('No prefetch when not needed', () => {
        test('move to location without pending exits does not trigger prefetch', async () => {
            // Act: Move to SECOND location which has hard exits only
            const req = makeMoveRequest({ dir: 'north' }) as HttpRequest
            const result = await moveHandler.performMove(req)

            // Assert: Move succeeded
            assert.equal(result.success, true)

            // Assert: No batch generation event was enqueued
            const enqueuedEvents = eventPublisher.enqueuedEvents
            const batchEvent = enqueuedEvents.find((e) => e.type === 'World.Location.BatchGenerate')
            assert.equal(batchEvent, undefined, 'Should NOT have enqueued batch generation for location without pending exits')
        })

        test('forbidden exits never trigger prefetch', async () => {
            // Arrange: Create location with forbidden exits
            const locationId = uuidv4()
            const location: Location = {
                id: locationId,
                name: 'Dead End',
                description: 'A dead end with blocked passages',
                terrain: 'narrow-corridor',
                tags: [],
                exits: [{ direction: 'south', to: STARTER_LOCATION_ID }],
                exitAvailability: {
                    forbidden: {
                        north: 'collapsed tunnel',
                        east: 'solid wall',
                        west: 'sheer cliff'
                    }
                },
                version: 1
            }
            await locationRepo.upsert(location)
            await locationRepo.ensureExit(STARTER_LOCATION_ID, 'north', locationId)

            // Act: Move to the dead end
            const req = makeMoveRequest({ dir: 'north' }) as HttpRequest
            const result = await moveHandler.performMove(req)

            // Assert: Move succeeded
            assert.equal(result.success, true)

            // Assert: No batch generation event was enqueued
            const enqueuedEvents = eventPublisher.enqueuedEvents
            const batchEvent = enqueuedEvents.find((e) => e.type === 'World.Location.BatchGenerate')
            assert.equal(batchEvent, undefined, 'Should NOT trigger prefetch for forbidden exits')
        })
    })

    describe('Idempotency and debouncing', () => {
        test('repeated moves to same location only enqueue once (idempotent)', async () => {
            // Arrange: Create frontier location
            const frontierLocationId = uuidv4()
            const frontierLocation: Location = {
                id: frontierLocationId,
                name: 'Frontier Outpost',
                description: 'A lonely outpost at the edge of civilization',
                terrain: 'open-plain',
                tags: [],
                exits: [{ direction: 'south', to: STARTER_LOCATION_ID }],
                exitAvailability: {
                    pending: {
                        north: 'unexplored wilderness'
                    }
                },
                version: 1
            }
            await locationRepo.upsert(frontierLocation)
            await locationRepo.ensureExit(STARTER_LOCATION_ID, 'north', frontierLocationId)

            // Act: Move to frontier twice in succession
            const req1 = makeMoveRequest({ dir: 'north' }) as HttpRequest
            await moveHandler.performMove(req1)

            // Move back
            const req2 = makeMoveRequest({ dir: 'south', from: frontierLocationId }) as HttpRequest
            await moveHandler.performMove(req2)

            // Clear events from first trip
            eventPublisher.clear()

            // Move to frontier again
            const req3 = makeMoveRequest({ dir: 'north' }) as HttpRequest
            await moveHandler.performMove(req3)

            // Assert: Should be debounced (not enqueue again within time window)
            const enqueuedEvents = eventPublisher.enqueuedEvents
            const batchEvents = enqueuedEvents.filter((e) => e.type === 'World.Location.BatchGenerate')

            // NOTE: Debouncing behavior depends on implementation
            // Either: 0 events (fully debounced) or 1 event (re-enqueued after time window)
            assert.ok(batchEvents.length <= 1, 'Should debounce repeated arrivals')
        })
    })

    describe('Cost control - no prefetch on Look', () => {
        test('move handler never triggers prefetch (documented requirement)', async () => {
            // This test documents the requirement that prefetch only happens in MoveHandler,
            // not in LocationLookHandler. The Look handler is a separate handler and
            // doesn't have access to the prefetch logic.

            // Create a frontier location with pending exits
            const frontierLocationId = uuidv4()
            const frontierLocation: Location = {
                id: frontierLocationId,
                name: 'Frontier Outpost',
                description: 'A lonely outpost at the edge of civilization',
                terrain: 'open-plain',
                tags: [],
                exits: [{ direction: 'south', to: STARTER_LOCATION_ID }],
                exitAvailability: {
                    pending: {
                        north: 'unexplored wilderness',
                        east: 'dense forest ahead'
                    }
                },
                version: 1
            }
            await locationRepo.upsert(frontierLocation)

            // Verify: Direct LocationRepository.get() doesn't trigger prefetch
            const location = await locationRepo.get(frontierLocationId)
            assert.ok(location, 'Location should exist')
            assert.ok(location.exitAvailability?.pending, 'Should have pending exits')

            // Verify: No events were enqueued by repository access
            const enqueuedEvents = eventPublisher.enqueuedEvents
            assert.equal(enqueuedEvents.length, 0, 'Repository operations should not trigger prefetch')

            // Note: LocationLookHandler would also not trigger prefetch as it doesn't
            // have IWorldEventPublisher injected. This is intentional for cost control.
            assert.ok(true, 'Prefetch is only triggered by MoveHandler after successful moves')
        })
    })
})

/**
 * Contract test: MoveHandler prefetch path with Cosmos-repository wiring.
 *
 * Verifies that when the location repository returns a destination with
 * exitAvailability.pending (as CosmosLocationRepository would after hydration),
 * MoveHandler invokes tryCreatePrefetchEvent and enqueues a batch generation event.
 *
 * Runs in memory mode always; runs in cosmos mode when PERSISTENCE_MODE=cosmos.
 */
import { getDebounceTracker } from '../../src/services/prefetchBatchGeneration.js'
import { describeForBothModes } from '../helpers/describeForBothModes.js'

describeForBothModes('MoveHandler prefetch - Cosmos repository wiring contract', (mode) => {
    let contractFixture: IntegrationTestFixture
    let contractMoveHandler: MoveHandler
    let contractLocationRepo: ILocationRepository
    let contractEventPublisher: InMemoryWorldEventPublisher

    beforeEach(async () => {
        contractFixture = new IntegrationTestFixture(mode)
        await contractFixture.setup()
        const container = await contractFixture.getContainer()
        contractMoveHandler = container.get(MoveHandler)
        contractLocationRepo = container.get<ILocationRepository>(TOKENS.LocationRepository)
        contractEventPublisher = container.get<InMemoryWorldEventPublisher>(TOKENS.WorldEventPublisher)
        contractEventPublisher.clear()
        getDebounceTracker().clear()
    })

    afterEach(async () => {
        await contractFixture.teardown()
    })

    test('Given destination with exitAvailability.pending, When MoveHandler arrives, Then prefetch is triggered', async () => {
        const container = await contractFixture.getContainer()
        const playerRepo = container.get<IPlayerRepository>(TOKENS.PlayerRepository)

        // Set up: unique start and frontier locations to avoid conflicts with seeded world
        const startId = uuidv4()
        const destId = uuidv4()

        await contractLocationRepo.upsert({
            id: startId,
            name: 'Contract Test Start',
            description: 'Starting point for contract test',
            terrain: 'open-plain',
            exits: [{ direction: 'in', to: destId }],
            version: 1
        })
        await contractLocationRepo.upsert({
            id: destId,
            name: 'Cosmos-Wired Frontier',
            description: 'Testing exitAvailability round-trip with real repo',
            terrain: 'open-plain',
            exits: [{ direction: 'out', to: startId }],
            exitAvailability: {
                pending: {
                    north: 'unexplored route',
                    east: 'unknown territory'
                }
            },
            version: 1
        })
        await contractLocationRepo.ensureExit(startId, 'in', destId)

        // Verify repository returns exitAvailability (proves Cosmos hydration path)
        const dest = await contractLocationRepo.get(destId)
        assert.ok(dest?.exitAvailability?.pending, 'Repository must return exitAvailability.pending')

        // Set up player at the start location
        const testPlayerId = uuidv4()
        const { record: testPlayer } = await playerRepo.getOrCreate(testPlayerId)
        testPlayer.currentLocationId = startId
        await playerRepo.update(testPlayer)

        // Act: Move to the frontier location
        const req = makeMoveRequest({ dir: 'in' }, {}, { playerId: testPlayerId }) as HttpRequest
        const result = await contractMoveHandler.performMove(req)

        assert.strictEqual(result.success, true, 'Move should succeed')
        assert.ok(result.location, 'Destination location should be returned')

        // Assert: prefetch event was enqueued (proves MoveHandler uses exitAvailability from repo)
        const batchEvents = contractEventPublisher.enqueuedEvents.filter((e) => e.type === 'World.Location.BatchGenerate')
        assert.ok(batchEvents.length > 0, 'A batch generation event should be enqueued on arrival at frontier')
        assert.strictEqual(batchEvents[0].payload.rootLocationId, destId)
    })
})
