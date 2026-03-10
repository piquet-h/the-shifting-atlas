import type { WorldEventEnvelope } from '@piquet-h/shared/events'
import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import { v4 as uuidv4 } from 'uuid'
import { TOKENS } from '../../src/di/tokens.js'
import type { ILocationRepository } from '../../src/repos/locationRepository.js'
import { BatchGenerateHandler } from '../../src/worldEvents/handlers/BatchGenerateHandler.js'
import type { IWorldEventPublisher } from '../../src/worldEvents/worldEventPublisher.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import type { MockTelemetryClient } from '../mocks/MockTelemetryClient.js'

describe('BatchGenerateHandler - macro context propagation', () => {
    let fixture: IntegrationTestFixture
    let handler: BatchGenerateHandler
    let locationRepo: ILocationRepository
    let eventPublisher: IWorldEventPublisher
    let telemetry: MockTelemetryClient

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        const container = await fixture.getContainer()
        handler = container.get(BatchGenerateHandler)
        locationRepo = container.get<ILocationRepository>(TOKENS.LocationRepository)
        eventPublisher = container.get<IWorldEventPublisher>(TOKENS.WorldEventPublisher)
        telemetry = (await fixture.getTelemetryClient()) as MockTelemetryClient
    })

    const snapshotLocationIds = async (): Promise<Set<string>> => new Set((await locationRepo.listAll()).map((location) => location.id))

    const selectGeneratedLocations = <T extends { id: string }>(allLocations: T[], beforeIds: Set<string>, rootLocationId: string): T[] =>
        allLocations.filter((location) => location.id !== rootLocationId && !beforeIds.has(location.id))

    const selectSingleGeneratedLocation = <T extends { id: string }>(
        allLocations: T[],
        beforeIds: Set<string>,
        rootLocationId: string
    ): T | undefined => selectGeneratedLocations(allLocations, beforeIds, rootLocationId)[0]

    test('generated stubs inherit root macro tags beyond realmKey', async () => {
        const rootLocationId = uuidv4()
        const beforeIds = await snapshotLocationIds()
        await locationRepo.upsert({
            id: rootLocationId,
            name: 'North Gate',
            description: 'A frontier gate above the harbor road.',
            terrain: 'open-plain',
            tags: [
                'settlement:mosswell',
                'frontier:boundary',
                'macro:area:lr-area-mosswell-fiordhead',
                'macro:route:mw-route-harbor-to-northgate',
                'macro:water:fjord-sound-head'
            ],
            exits: [],
            version: 1
        })

        const event: WorldEventEnvelope = {
            eventId: uuidv4(),
            type: 'World.Location.BatchGenerate',
            occurredUtc: new Date().toISOString(),
            actor: { kind: 'system' },
            correlationId: uuidv4(),
            idempotencyKey: `batch:${uuidv4()}`,
            version: 1,
            payload: {
                rootLocationId,
                terrain: 'open-plain',
                arrivalDirection: 'south',
                expansionDepth: 1,
                batchSize: 1,
                realmKey: 'macro:area:lr-area-mosswell-fiordhead'
            }
        }

        const result = await handler.handle(event, { log() {} } as never)
        assert.equal(result.outcome, 'success')

        const allLocations = await locationRepo.listAll()
        const generated = selectGeneratedLocations(allLocations, beforeIds, rootLocationId)
        assert.equal(generated.length, 1)
        assert.ok(generated[0].tags?.includes('macro:area:lr-area-mosswell-fiordhead'))
        assert.ok(generated[0].tags?.includes('macro:route:mw-route-harbor-to-northgate'))
        assert.ok(generated[0].tags?.includes('macro:water:fjord-sound-head'))
    })

    test('generated stub names preserve route continuity when atlas provides a preferred prefix', async () => {
        const rootLocationId = uuidv4()
        const beforeIds = await snapshotLocationIds()
        await locationRepo.upsert({
            id: rootLocationId,
            name: 'North Gate',
            description: 'A frontier gate above the harbor road.',
            terrain: 'open-plain',
            tags: [
                'settlement:mosswell',
                'frontier:boundary',
                'macro:area:lr-area-mosswell-fiordhead',
                'macro:route:mw-route-harbor-to-northgate',
                'macro:water:fjord-sound-head'
            ],
            exits: [],
            version: 1
        })

        const event: WorldEventEnvelope = {
            eventId: uuidv4(),
            type: 'World.Location.BatchGenerate',
            occurredUtc: new Date().toISOString(),
            actor: { kind: 'system' },
            correlationId: uuidv4(),
            idempotencyKey: `batch:${uuidv4()}`,
            version: 1,
            payload: {
                rootLocationId,
                terrain: 'open-plain',
                arrivalDirection: 'south',
                expansionDepth: 1,
                batchSize: 1,
                realmKey: 'macro:area:lr-area-mosswell-fiordhead'
            }
        }

        const result = await handler.handle(event, { log() {} } as never)
        assert.equal(result.outcome, 'success')

        const allLocations = await locationRepo.listAll()
        const generated = selectSingleGeneratedLocation(allLocations, beforeIds, rootLocationId)
        assert.ok(generated)
        assert.ok(generated?.name.includes('North Road'))
        assert.ok(!generated?.name.includes('Unexplored Open Plain'))
    })

    test('generated stub pending exits use atlas-aware barrier and water hints instead of generic wilderness text', async () => {
        const rootLocationId = uuidv4()
        const beforeIds = await snapshotLocationIds()
        await locationRepo.upsert({
            id: rootLocationId,
            name: 'Mosswell River Jetty',
            description: 'The inner harbor approach.',
            terrain: 'open-plain',
            tags: [
                'settlement:mosswell',
                'macro:area:lr-area-mosswell-fiordhead',
                'macro:route:mw-route-harbor-to-delta',
                'macro:water:fjord-sound-head'
            ],
            exits: [],
            version: 1
        })

        const event: WorldEventEnvelope = {
            eventId: uuidv4(),
            type: 'World.Location.BatchGenerate',
            occurredUtc: new Date().toISOString(),
            actor: { kind: 'system' },
            correlationId: uuidv4(),
            idempotencyKey: `batch:${uuidv4()}`,
            version: 1,
            payload: {
                rootLocationId,
                terrain: 'open-plain',
                arrivalDirection: 'south',
                expansionDepth: 1,
                batchSize: 1,
                realmKey: 'macro:area:lr-area-mosswell-fiordhead'
            }
        }

        const result = await handler.handle(event, { log() {} } as never)
        assert.equal(result.outcome, 'success')

        const allLocations = await locationRepo.listAll()
        const generated = selectSingleGeneratedLocation(allLocations, beforeIds, rootLocationId)
        assert.ok(generated?.exitAvailability?.pending)

        const pendingDescriptions = Object.values(generated!.exitAvailability!.pending!)
        assert.ok(pendingDescriptions.some((value) => value.includes('fjord') || value.includes('sound')))
        assert.ok(pendingDescriptions.some((value) => value.includes('Fiord Deeps') || value.includes('Delta Marsh Break')))
        assert.ok(pendingDescriptions.every((value) => value !== 'Open wilderness awaiting exploration'))
    })

    test('generated westward Mosswell waterfront expansion uses atlas-biased terrain instead of root fallback terrain', async () => {
        const rootLocationId = uuidv4()
        await locationRepo.upsert({
            id: rootLocationId,
            name: 'Mosswell River Jetty',
            description: 'The inner harbor approach.',
            terrain: 'open-plain',
            tags: [
                'settlement:mosswell',
                'macro:area:lr-area-mosswell-fiordhead',
                'macro:route:mw-route-harbor-to-delta',
                'macro:water:fjord-sound-head'
            ],
            exits: [],
            version: 1
        })

        const event: WorldEventEnvelope = {
            eventId: uuidv4(),
            type: 'World.Location.BatchGenerate',
            occurredUtc: new Date().toISOString(),
            actor: { kind: 'system' },
            correlationId: uuidv4(),
            idempotencyKey: `batch:${uuidv4()}`,
            version: 1,
            payload: {
                rootLocationId,
                terrain: 'open-plain',
                arrivalDirection: 'north',
                expansionDepth: 1,
                batchSize: 3,
                realmKey: 'macro:area:lr-area-mosswell-fiordhead'
            }
        }

        const result = await handler.handle(event, { log() {} } as never)
        assert.equal(result.outcome, 'success')

        const allLocations = await locationRepo.listAll()
        const westwardGenerated = allLocations.find((location) => location.id !== rootLocationId && location.name.includes('Westward'))

        assert.ok(westwardGenerated)
        assert.equal(westwardGenerated?.terrain, 'narrow-corridor')
    })

    test('batch generation prioritizes atlas-coherent directions instead of raw terrain default order', async () => {
        const rootLocationId = uuidv4()
        await locationRepo.upsert({
            id: rootLocationId,
            name: 'North Gate',
            description: 'A frontier gate above the harbor road.',
            terrain: 'open-plain',
            tags: [
                'settlement:mosswell',
                'frontier:boundary',
                'macro:area:lr-area-mosswell-fiordhead',
                'macro:route:mw-route-harbor-to-northgate',
                'macro:water:fjord-sound-head'
            ],
            exits: [],
            version: 1
        })

        const event: WorldEventEnvelope = {
            eventId: uuidv4(),
            type: 'World.Location.BatchGenerate',
            occurredUtc: new Date().toISOString(),
            actor: { kind: 'system' },
            correlationId: uuidv4(),
            idempotencyKey: `batch:${uuidv4()}`,
            version: 1,
            payload: {
                rootLocationId,
                terrain: 'open-plain',
                arrivalDirection: 'east',
                expansionDepth: 1,
                batchSize: 2,
                realmKey: 'macro:area:lr-area-mosswell-fiordhead'
            }
        }

        const result = await handler.handle(event, { log() {} } as never)
        assert.equal(result.outcome, 'success')

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const enqueuedEvents = ((eventPublisher as any).enqueuedEvents || []) as Array<{ payload: { direction: string } }>
        const directions = enqueuedEvents.map((entry) => entry.payload.direction)

        assert.deepEqual(directions, ['north', 'west'])
    })

    test('fuzzy reconnection prefers atlas-compatible candidate over generic candidate at equal travel distance', async () => {
        const rootLocationId = '10000000-0000-4000-8000-000000000001'
        const southPivotId = '10000000-0000-4000-8000-000000000002'
        const northPivotId = '10000000-0000-4000-8000-000000000003'
        const genericCandidateId = '10000000-0000-4000-8000-000000000004'
        const compatibleCandidateId = '10000000-0000-4000-8000-000000000099'

        await locationRepo.upsert({
            id: rootLocationId,
            name: 'Mosswell River Jetty',
            description: 'The inner harbor approach.',
            terrain: 'open-plain',
            tags: [
                'settlement:mosswell',
                'macro:area:lr-area-mosswell-fiordhead',
                'macro:route:mw-route-harbor-to-delta',
                'macro:water:fjord-sound-head'
            ],
            exits: [],
            version: 1
        })

        await locationRepo.upsert({
            id: southPivotId,
            name: 'South Pivot',
            description: '',
            terrain: 'open-plain',
            tags: ['macro:area:lr-area-mosswell-fiordhead'],
            exits: [],
            version: 1
        })
        await locationRepo.upsert({
            id: northPivotId,
            name: 'North Pivot',
            description: '',
            terrain: 'open-plain',
            tags: ['macro:area:lr-area-mosswell-fiordhead'],
            exits: [],
            version: 1
        })
        await locationRepo.upsert({
            id: genericCandidateId,
            name: 'Generic West Candidate',
            description: '',
            terrain: 'open-plain',
            tags: ['settlement:mosswell', 'macro:area:lr-area-mosswell-fiordhead'],
            exits: [],
            version: 1
        })
        await locationRepo.upsert({
            id: compatibleCandidateId,
            name: 'Compatible West Candidate',
            description: '',
            terrain: 'narrow-corridor',
            tags: [
                'settlement:mosswell',
                'macro:area:lr-area-mosswell-fiordhead',
                'macro:route:mw-route-harbor-to-delta',
                'macro:water:fjord-sound-head'
            ],
            exits: [],
            version: 1
        })

        await locationRepo.ensureExitBidirectional(rootLocationId, 'south', southPivotId, { reciprocal: true })
        await locationRepo.ensureExitBidirectional(rootLocationId, 'north', northPivotId, { reciprocal: true })
        await locationRepo.ensureExitBidirectional(southPivotId, 'west', genericCandidateId, { reciprocal: true })
        await locationRepo.ensureExitBidirectional(northPivotId, 'west', compatibleCandidateId, { reciprocal: true })

        await locationRepo.setExitTravelDuration(rootLocationId, 'south', 60_000)
        await locationRepo.setExitTravelDuration(southPivotId, 'west', 60_000)
        await locationRepo.setExitTravelDuration(rootLocationId, 'north', 60_000)
        await locationRepo.setExitTravelDuration(northPivotId, 'west', 60_000)

        const event: WorldEventEnvelope = {
            eventId: uuidv4(),
            type: 'World.Location.BatchGenerate',
            occurredUtc: new Date().toISOString(),
            actor: { kind: 'system' },
            correlationId: uuidv4(),
            idempotencyKey: `batch:${uuidv4()}`,
            version: 1,
            payload: {
                rootLocationId,
                terrain: 'open-plain',
                arrivalDirection: 'east',
                expansionDepth: 1,
                batchSize: 3,
                realmKey: 'macro:area:lr-area-mosswell-fiordhead'
            }
        }

        const result = await handler.handle(event, { log() {} } as never)
        assert.equal(result.outcome, 'success')

        const rootAfter = await locationRepo.get(rootLocationId)
        const westExit = rootAfter?.exits?.find((exit) => exit.direction === 'west')

        assert.ok(westExit)
        assert.equal(westExit?.to, compatibleCandidateId)
        assert.notEqual(westExit?.to, genericCandidateId)
    })

    test('generated waterfront stub marks atlas-blocked direction as forbidden before any further generation occurs', async () => {
        const rootLocationId = uuidv4()
        await locationRepo.upsert({
            id: rootLocationId,
            name: 'Mosswell River Jetty',
            description: 'The inner harbor approach.',
            terrain: 'open-plain',
            tags: [
                'settlement:mosswell',
                'macro:area:lr-area-mosswell-fiordhead',
                'macro:route:mw-route-harbor-to-delta',
                'macro:water:fjord-sound-head'
            ],
            exits: [],
            version: 1
        })

        const event: WorldEventEnvelope = {
            eventId: uuidv4(),
            type: 'World.Location.BatchGenerate',
            occurredUtc: new Date().toISOString(),
            actor: { kind: 'system' },
            correlationId: uuidv4(),
            idempotencyKey: `batch:${uuidv4()}`,
            version: 1,
            payload: {
                rootLocationId,
                terrain: 'open-plain',
                arrivalDirection: 'north',
                expansionDepth: 1,
                batchSize: 3,
                realmKey: 'macro:area:lr-area-mosswell-fiordhead'
            }
        }

        const result = await handler.handle(event, { log() {} } as never)
        assert.equal(result.outcome, 'success')

        const allLocations = await locationRepo.listAll()
        const westwardGenerated = allLocations.find((location) => location.id !== rootLocationId && location.name.includes('Westward'))

        assert.ok(westwardGenerated?.exitAvailability)
        assert.ok(westwardGenerated?.exitAvailability?.forbidden?.west)
        assert.ok(!westwardGenerated?.exitAvailability?.pending?.west)
        assert.ok(westwardGenerated?.exitAvailability?.pending?.north)
        assert.ok(westwardGenerated?.exitAvailability?.pending?.south)
    })

    test('exit tailoring telemetry emitted once per generated stub during batch generation', async () => {
        const rootLocationId = uuidv4()
        await locationRepo.upsert({
            id: rootLocationId,
            name: 'North Gate',
            description: 'A frontier gate above the harbor road.',
            terrain: 'open-plain',
            tags: ['settlement:mosswell', 'frontier:boundary'],
            exits: [],
            version: 1
        })

        const event: WorldEventEnvelope = {
            eventId: uuidv4(),
            type: 'World.Location.BatchGenerate',
            occurredUtc: new Date().toISOString(),
            actor: { kind: 'system' },
            correlationId: uuidv4(),
            idempotencyKey: `batch:${uuidv4()}`,
            version: 1,
            payload: {
                rootLocationId,
                terrain: 'open-plain',
                arrivalDirection: 'south',
                expansionDepth: 1,
                batchSize: 2
            }
        }

        const result = await handler.handle(event, { log() {} } as never)
        assert.equal(result.outcome, 'success')

        // With no real AI endpoint in tests, NullAzureOpenAIClient returns null for generate().
        // ExitDescriptionService proceeds past the no-ai check (client IS bound, not undefined),
        // reaches TailoringStarted, calls generate(), gets null, falls back to scaffold.
        // So we expect exactly one TailoringStarted per stub (batchSize=2 -> 2 stubs).
        const tailoringStarted = telemetry.events.filter((e) => e.name === 'Navigation.Exit.TailoringStarted')
        assert.equal(tailoringStarted.length, 2, 'TailoringStarted should be emitted once per generated stub')

        // All events must carry direction and durationBucket
        for (const event of tailoringStarted) {
            assert.ok(event.properties['direction'], 'TailoringStarted must include direction')
            assert.ok(event.properties['durationBucket'], 'TailoringStarted must include durationBucket')
            assert.equal(
                event.properties['hasDestination'],
                true,
                'TailoringStarted must have hasDestination=true (destination snippet from AI location description)'
            )
        }
    })
})
