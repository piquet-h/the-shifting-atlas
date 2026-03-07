import type { WorldEventEnvelope } from '@piquet-h/shared/events'
import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import { v4 as uuidv4 } from 'uuid'
import { TOKENS } from '../../src/di/tokens.js'
import type { ILocationRepository } from '../../src/repos/locationRepository.js'
import { BatchGenerateHandler } from '../../src/worldEvents/handlers/BatchGenerateHandler.js'
import type { IWorldEventPublisher } from '../../src/worldEvents/worldEventPublisher.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describe('BatchGenerateHandler - macro context propagation', () => {
    let fixture: IntegrationTestFixture
    let handler: BatchGenerateHandler
    let locationRepo: ILocationRepository
    let eventPublisher: IWorldEventPublisher

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        const container = await fixture.getContainer()
        handler = container.get(BatchGenerateHandler)
        locationRepo = container.get<ILocationRepository>(TOKENS.LocationRepository)
        eventPublisher = container.get<IWorldEventPublisher>(TOKENS.WorldEventPublisher)
    })

    test('generated stubs inherit root macro tags beyond realmKey', async () => {
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
                arrivalDirection: 'south',
                expansionDepth: 1,
                batchSize: 1,
                realmKey: 'macro:area:lr-area-mosswell-fiordhead'
            }
        }

        const result = await handler.handle(event, { log() {} } as never)
        assert.equal(result.outcome, 'success')

        const allLocations = await locationRepo.listAll()
        const generated = allLocations.filter(
            (location) => location.id !== rootLocationId && location.tags?.includes('macro:route:mw-route-harbor-to-northgate')
        )
        assert.equal(generated.length, 1)
        assert.ok(generated[0].tags?.includes('macro:area:lr-area-mosswell-fiordhead'))
        assert.ok(generated[0].tags?.includes('macro:route:mw-route-harbor-to-northgate'))
        assert.ok(generated[0].tags?.includes('macro:water:fjord-sound-head'))
    })

    test('generated stub names preserve route continuity when atlas provides a preferred prefix', async () => {
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
                arrivalDirection: 'south',
                expansionDepth: 1,
                batchSize: 1,
                realmKey: 'macro:area:lr-area-mosswell-fiordhead'
            }
        }

        const result = await handler.handle(event, { log() {} } as never)
        assert.equal(result.outcome, 'success')

        const allLocations = await locationRepo.listAll()
        const generated = allLocations.find(
            (location) => location.id !== rootLocationId && location.tags?.includes('macro:route:mw-route-harbor-to-northgate')
        )
        assert.ok(generated)
        assert.ok(generated?.name.includes('North Road'))
        assert.ok(!generated?.name.includes('Unexplored Open Plain'))
    })

    test('generated stub pending exits use atlas-aware barrier and water hints instead of generic wilderness text', async () => {
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
                arrivalDirection: 'south',
                expansionDepth: 1,
                batchSize: 1,
                realmKey: 'macro:area:lr-area-mosswell-fiordhead'
            }
        }

        const result = await handler.handle(event, { log() {} } as never)
        assert.equal(result.outcome, 'success')

        const allLocations = await locationRepo.listAll()
        const generated = allLocations.find(
            (location) => location.id !== rootLocationId && location.tags?.includes('macro:water:fjord-sound-head')
        )
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
})
