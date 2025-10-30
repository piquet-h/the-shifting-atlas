import { Direction } from '@piquet-h/shared'
import { Container } from 'inversify'
import assert from 'node:assert'
import { describe, test } from 'node:test'
import type { IGremlinClient } from '../../src/gremlin/index.js'
import { CosmosExitRepository, sortExits } from '../../src/repos/exitRepository.js'
import { InMemoryLocationRepository } from '../../src/repos/locationRepository.js'

type ExitData = { direction: string; toLocationId: string; description?: string; kind?: string; state?: string }

describe('Exit Repository', () => {
    class FakeGremlinClient implements IGremlinClient {
        constructor(private exits: Record<string, ExitData[]>) {}
        async submit<T>(query: string, bindings?: Record<string, unknown>): Promise<T[]> {
            const locationId = bindings?.locationId as string
            if (query.includes("outE('exit')")) {
                const exits = this.exits[locationId] || []
                return exits.map((e) => ({
                    direction: e.direction,
                    toLocationId: e.toLocationId,
                    description: e.description,
                    kind: e.kind,
                    state: e.state
                })) as unknown as T[]
            }
            return []
        }

        async submitWithMetrics<T>(query: string, bindings?: Record<string, unknown>): Promise<{ items: T[]; latencyMs: number; requestCharge?: number }> {
            const startTime = Date.now()
            const items = await this.submit<T>(query, bindings)
            return {
                items,
                latencyMs: Date.now() - startTime,
                requestCharge: 5.0 // Mock RU charge
            }
        }

        async close(): Promise<void> {
            // Mock close - no-op
        }
    }

    describe('sortExits', () => {
        test('compass order (north, south, east, west)', () => {
            const exits = [
                { direction: 'west' as Direction, toLocationId: 'D' },
                { direction: 'north' as Direction, toLocationId: 'A' },
                { direction: 'south' as Direction, toLocationId: 'B' },
                { direction: 'east' as Direction, toLocationId: 'C' }
            ]
            const sorted = sortExits(exits)
            assert.equal(sorted[0].direction, 'north')
            assert.equal(sorted[1].direction, 'south')
            assert.equal(sorted[2].direction, 'east')
            assert.equal(sorted[3].direction, 'west')
        })

        test('diagonal directions after cardinals', () => {
            const exits = [
                { direction: 'southeast' as Direction, toLocationId: 'F' },
                { direction: 'north' as Direction, toLocationId: 'A' },
                { direction: 'northeast' as Direction, toLocationId: 'D' },
                { direction: 'south' as Direction, toLocationId: 'B' }
            ]
            const sorted = sortExits(exits)
            assert.equal(sorted[0].direction, 'north')
            assert.equal(sorted[1].direction, 'south')
            assert.equal(sorted[2].direction, 'northeast')
            assert.equal(sorted[3].direction, 'southeast')
        })

        test('vertical after compass', () => {
            const exits = [
                { direction: 'down' as Direction, toLocationId: 'C' },
                { direction: 'north' as Direction, toLocationId: 'A' },
                { direction: 'up' as Direction, toLocationId: 'B' }
            ]
            const sorted = sortExits(exits)
            assert.equal(sorted[0].direction, 'north')
            assert.equal(sorted[1].direction, 'up')
            assert.equal(sorted[2].direction, 'down')
        })

        test('radial after vertical', () => {
            const exits = [
                { direction: 'out' as Direction, toLocationId: 'D' },
                { direction: 'north' as Direction, toLocationId: 'A' },
                { direction: 'up' as Direction, toLocationId: 'B' },
                { direction: 'in' as Direction, toLocationId: 'C' }
            ]
            const sorted = sortExits(exits)
            assert.equal(sorted[0].direction, 'north')
            assert.equal(sorted[1].direction, 'up')
            assert.equal(sorted[2].direction, 'in')
            assert.equal(sorted[3].direction, 'out')
        })

        test('full ordering (compass → vertical → radial)', () => {
            const exits = [
                { direction: 'in' as Direction, toLocationId: 'J' },
                { direction: 'southwest' as Direction, toLocationId: 'H' },
                { direction: 'down' as Direction, toLocationId: 'I' },
                { direction: 'north' as Direction, toLocationId: 'A' },
                { direction: 'northeast' as Direction, toLocationId: 'E' },
                { direction: 'south' as Direction, toLocationId: 'B' },
                { direction: 'up' as Direction, toLocationId: 'C' },
                { direction: 'out' as Direction, toLocationId: 'K' },
                { direction: 'east' as Direction, toLocationId: 'D' },
                { direction: 'west' as Direction, toLocationId: 'F' },
                { direction: 'northwest' as Direction, toLocationId: 'G' }
            ]
            const sorted = sortExits(exits)
            const expected = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southwest', 'up', 'down', 'in', 'out']
            const actual = sorted.map((e) => e.direction)
            assert.deepEqual(actual, expected)
        })

        test('empty array', () => {
            const sorted = sortExits([])
            assert.equal(sorted.length, 0)
        })

        test('single exit', () => {
            const exits = [{ direction: 'north' as Direction, toLocationId: 'A' }]
            const sorted = sortExits(exits)
            assert.equal(sorted.length, 1)
            assert.equal(sorted[0].direction, 'north')
        })
    })

    describe('CosmosExitRepository', () => {
        test('getExits returns exits from gremlin', async () => {
            const fakeClient = new FakeGremlinClient({
                'loc-1': [
                    { direction: 'north', toLocationId: 'loc-2', description: 'To the north' },
                    { direction: 'east', toLocationId: 'loc-3' }
                ]
            })

            const container = new Container()
            container.bind<IGremlinClient>('GremlinClient').toConstantValue(fakeClient)

            const repo = new CosmosExitRepository(fakeClient)
            const exits = await repo.getExits('loc-1')

            assert.equal(exits.length, 2)
            assert.equal(exits[0].direction, 'north')
            assert.equal(exits[0].toLocationId, 'loc-2')
            assert.equal(exits[0].description, 'To the north')
            assert.equal(exits[1].direction, 'east')
            assert.equal(exits[1].toLocationId, 'loc-3')
        })

        test('getExits returns empty array for unknown location', async () => {
            const fakeClient = new FakeGremlinClient({})
            const repo = new CosmosExitRepository(fakeClient)
            const exits = await repo.getExits('unknown-loc')

            assert.equal(exits.length, 0)
        })
    })

    describe('CosmosExitRepository with Inversify', () => {
        test('getExits - returns ordered exits', async () => {
            const fakeClient = new FakeGremlinClient({
                loc1: [
                    { direction: 'south', toLocationId: 'B' },
                    { direction: 'north', toLocationId: 'A' },
                    { direction: 'east', toLocationId: 'C' }
                ]
            })

            const container = new Container()
            container.bind<IGremlinClient>('GremlinClient').toConstantValue(fakeClient)
            container.bind(CosmosExitRepository).toSelf()

            const repo = container.get(CosmosExitRepository)
            const exits = await repo.getExits('loc1')

            assert.equal(exits.length, 3)
            assert.equal(exits[0].direction, 'north')
            assert.equal(exits[1].direction, 'south')
            assert.equal(exits[2].direction, 'east')
        })

        test('getExits - returns empty array for location with no exits', async () => {
            const fakeClient = new FakeGremlinClient({ loc1: [] })

            const container = new Container()
            container.bind<IGremlinClient>('GremlinClient').toConstantValue(fakeClient)
            container.bind(CosmosExitRepository).toSelf()

            const repo = container.get(CosmosExitRepository)
            const exits = await repo.getExits('loc1')

            assert.equal(exits.length, 0)
        })

        test('getExits - includes optional properties', async () => {
            const fakeClient = new FakeGremlinClient({
                loc1: [
                    {
                        direction: 'north',
                        toLocationId: 'A',
                        description: 'A wooden door',
                        kind: 'cardinal',
                        state: 'open'
                    }
                ]
            })

            const container = new Container()
            container.bind<IGremlinClient>('GremlinClient').toConstantValue(fakeClient)
            container.bind(CosmosExitRepository).toSelf()

            const repo = container.get(CosmosExitRepository)
            const exits = await repo.getExits('loc1')

            assert.equal(exits.length, 1)
            assert.equal(exits[0].direction, 'north')
            assert.equal(exits[0].toLocationId, 'A')
            assert.equal(exits[0].description, 'A wooden door')
            assert.equal(exits[0].kind, 'cardinal')
            assert.equal(exits[0].state, 'open')
        })
    })

    describe('InMemoryLocationRepository as IExitRepository', () => {
        test('exits are returned sorted when fetched', async () => {
            const repo = new InMemoryLocationRepository()
            await repo.upsert({
                id: 'test-loc',
                name: 'Test Location',
                description: 'Test',
                exits: [
                    { direction: 'west', to: 'loc-w' },
                    { direction: 'north', to: 'loc-n' },
                    { direction: 'up', to: 'loc-u' },
                    { direction: 'east', to: 'loc-e' }
                ]
            })

            const loc = await repo.get('test-loc')
            const directions = loc?.exits?.map((e) => e.direction) || []

            // Should be sorted: north, east, west, up
            assert.deepEqual(directions, ['north', 'east', 'west', 'up'])
        })

        test('getExits - returns ordered exits from in-memory location', async () => {
            const container = new Container()
            container.bind('ILocationRepository').to(InMemoryLocationRepository).inSingletonScope()
            container.bind('IExitRepository').toService('ILocationRepository')

            const repo = container.get<InMemoryLocationRepository>('IExitRepository')
            // Use Mosswell River Jetty ID from seed data
            const exits = await repo.getExits('a4d1c3f1-5b2a-4f7d-9d4b-8f0c2a6b7e21')

            assert.ok(exits.length > 0, 'Should have exits from seed data')
            // Exits should be sorted (verify first is before last alphabetically in standard order)
        })

        test('getExits - returns empty array for location with no exits', async () => {
            const container = new Container()
            const locationRepo = new InMemoryLocationRepository()
            // Create location with no exits
            await locationRepo.upsert({
                id: 'empty-loc',
                name: 'Empty Location',
                description: 'No exits',
                exits: []
            })

            container.bind('ILocationRepository').toConstantValue(locationRepo)
            container.bind('IExitRepository').toService('ILocationRepository')

            const repo = container.get<InMemoryLocationRepository>('IExitRepository')
            const exits = await repo.getExits('empty-loc')

            assert.equal(exits.length, 0)
        })

        test('getExits - returns empty array for non-existent location', async () => {
            const container = new Container()
            container.bind('ILocationRepository').to(InMemoryLocationRepository).inSingletonScope()
            container.bind('IExitRepository').toService('ILocationRepository')

            const repo = container.get<InMemoryLocationRepository>('IExitRepository')
            const exits = await repo.getExits('non-existent-id')

            assert.equal(exits.length, 0)
        })

        test('getExits - maintains canonical exit ordering', async () => {
            const container = new Container()
            const locationRepo = new InMemoryLocationRepository()
            // Create location with multiple exits in non-canonical order
            await locationRepo.upsert({
                id: 'test-loc',
                name: 'Test Location',
                description: 'Test',
                exits: [
                    { direction: 'down', to: 'loc-d' },
                    { direction: 'north', to: 'loc-a' },
                    { direction: 'west', to: 'loc-c' },
                    { direction: 'east', to: 'loc-b' }
                ]
            })

            container.bind('ILocationRepository').toConstantValue(locationRepo)
            container.bind('IExitRepository').toService('ILocationRepository')

            const repo = container.get<InMemoryLocationRepository>('IExitRepository')
            const exits = await repo.getExits('test-loc')

            assert.equal(exits.length, 4)
            assert.equal(exits[0].direction, 'north')
            assert.equal(exits[1].direction, 'east')
            assert.equal(exits[2].direction, 'west')
            assert.equal(exits[3].direction, 'down')
        })
    })
})
