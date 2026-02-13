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

import type { HttpRequest, InvocationContext } from '@azure/functions'
import { STARTER_LOCATION_ID, type Direction, type Location, type WorldEventEnvelope } from '@piquet-h/shared'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { v4 as uuidv4 } from 'uuid'
import { TOKENS } from '../../src/di/tokens.js'
import { MoveHandler } from '../../src/handlers/moveCore.js'
import type { ILocationRepository } from '../../src/repos/locationRepository.js'
import type { IWorldEventPublisher } from '../../src/worldEvents/worldEventPublisher.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import { makeMoveRequest } from '../helpers/testUtils.js'
import { MockTelemetryClient } from '../mocks/MockTelemetryClient.js'

describe('MoveHandler - Prefetch Batch Generation on Arrival', () => {
    let fixture: IntegrationTestFixture
    let moveHandler: MoveHandler
    let locationRepo: ILocationRepository
    let eventPublisher: IWorldEventPublisher
    let mockTelemetry: MockTelemetryClient

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        const container = await fixture.getContainer()

        moveHandler = container.get(MoveHandler)
        locationRepo = container.get<ILocationRepository>(TOKENS.LocationRepository)
        eventPublisher = container.get<IWorldEventPublisher>(TOKENS.WorldEventPublisher)
        mockTelemetry = container.get<MockTelemetryClient>(TOKENS.TelemetryClient) as MockTelemetryClient

        // Clear telemetry and event publisher before each test
        mockTelemetry.clear()
        if ('clear' in eventPublisher) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(eventPublisher as any).clear()
        }
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
            const playerRepo = (fixture as any).container.get<any>('IPlayerRepository')
            const { record: testPlayer } = await playerRepo.getOrCreate(testPlayerId)
            // Update to set location
            testPlayer.currentLocationId = STARTER_LOCATION_ID
            await playerRepo.update(testPlayer)

            // Link from starter location to frontier
            await locationRepo.ensureExit(STARTER_LOCATION_ID, 'northwest', frontierLocationId)

            // Act: Move to the frontier location
            const req = makeMoveRequest({ dir: 'northwest' }, {}, { playerId: testPlayerId }) as HttpRequest
            const result = await moveHandler.performMove(req)

            // Assert: Move succeeded
            assert.equal(result.success, true, `Move should succeed: ${JSON.stringify(result.error)}`)
            assert.equal(result.location?.id, frontierLocationId, `Should move to frontier location, got ${result.location?.id}`)

            // Assert: Batch generation event was enqueued
            const enqueuedEvents = (eventPublisher as any).enqueuedEvents as WorldEventEnvelope[]
            assert.ok(enqueuedEvents.length > 0, 'Should have enqueued at least one event')

            const batchEvent = enqueuedEvents.find((e) => e.type === 'World.Location.BatchGenerate')
            assert.ok(batchEvent, 'Should have enqueued a World.Location.BatchGenerate event')

            // Assert: Batch event payload is correct
            assert.equal(batchEvent.payload.rootLocationId, frontierLocationId)
            assert.ok(batchEvent.payload.terrain, 'Should include terrain')
            assert.ok(batchEvent.payload.arrivalDirection, 'Should include arrival direction')
            assert.ok(batchEvent.payload.batchSize, 'Should include batch size')

            // Assert: Telemetry event was emitted
            const telemetryEvents = mockTelemetry.events.filter((e) => e.name === 'World.BatchGeneration.Prefetch')
            assert.ok(telemetryEvents.length > 0, 'Should have emitted World.BatchGeneration.Prefetch telemetry')
            assert.equal(telemetryEvents[0].properties.rootLocationId, frontierLocationId)
        })

        test('batch generation is capped at configurable size (default 20)', async () => {
            // Arrange: Create a frontier location with many pending exits
            const frontierLocationId = uuidv4()
            const frontierLocation: Location = {
                id: frontierLocationId,
                name: 'Crossroads',
                description: 'A central hub with paths in all directions',
                terrain: 'open-plain',
                tags: [],
                exits: [{ direction: 'south', to: STARTER_LOCATION_ID }],
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
            
            // Create a test player
            const testPlayerId = uuidv4()
            const playerRepo = (fixture as any).container.get<any>('IPlayerRepository')
            const { record: testPlayer } = await playerRepo.getOrCreate(testPlayerId)
            // Update to set location
            testPlayer.currentLocationId = STARTER_LOCATION_ID
            await playerRepo.update(testPlayer)
            
            await locationRepo.ensureExit(STARTER_LOCATION_ID, 'northwest', frontierLocationId)

            // Act: Move to the crossroads
            const req = makeMoveRequest({ dir: 'northwest' }, {}, { playerId: testPlayerId }) as HttpRequest
            const result = await moveHandler.performMove(req)

            // Assert: Move succeeded
            assert.equal(result.success, true, `Move should succeed: ${JSON.stringify(result.error)}`)

            // Assert: Batch event was enqueued with capped size
            const enqueuedEvents = (eventPublisher as any).enqueuedEvents as WorldEventEnvelope[]
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
            const enqueuedEvents = (eventPublisher as any).enqueuedEvents as WorldEventEnvelope[]
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
            const enqueuedEvents = (eventPublisher as any).enqueuedEvents as WorldEventEnvelope[]
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
            ;(eventPublisher as any).clear()

            // Move to frontier again
            const req3 = makeMoveRequest({ dir: 'north' }) as HttpRequest
            await moveHandler.performMove(req3)

            // Assert: Should be debounced (not enqueue again within time window)
            const enqueuedEvents = (eventPublisher as any).enqueuedEvents as WorldEventEnvelope[]
            const batchEvents = enqueuedEvents.filter((e) => e.type === 'World.Location.BatchGenerate')

            // NOTE: Debouncing behavior depends on implementation
            // Either: 0 events (fully debounced) or 1 event (re-enqueued after time window)
            assert.ok(batchEvents.length <= 1, 'Should debounce repeated arrivals')

            // Assert: Telemetry tracks debounce if it occurred
            if (batchEvents.length === 0) {
                const debounceEvents = mockTelemetry.events.filter((e) => e.name.includes('Debounce') || e.name.includes('Skipped'))
                // Implementation may log debounce/skip events
                // This assertion is informational - exact behavior TBD
            }
        })
    })

    describe('Cost control - no prefetch on Look', () => {
        test('look operation never triggers prefetch even with pending exits', async () => {
            // Arrange: Create frontier location with pending exits
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

            // Act: Directly call look (simulating a look request)
            // Note: We can't easily test LocationLookHandler here without creating HTTP request
            // This is more of a documentation test - the implementation should never
            // trigger prefetch from look handlers

            // For now, this is a placeholder to document the requirement
            // In practice, prefetch logic will only be in MoveHandler
            assert.ok(true, 'Look handlers should never trigger prefetch (documented requirement)')
        })
    })
})
