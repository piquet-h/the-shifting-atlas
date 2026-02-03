/**
 * MoveHandler Hero Prose (Arrival) Integration Test
 *
 * Intent: Cover the gap where players "arrive" at a location via /player/{id}/move
 * and should receive hero prose on the first arrival when no cached hero prose exists.
 *
 * This test is memory-mode and stubs Azure OpenAI client behavior (no network).
 */

import type { HttpRequest, InvocationContext } from '@azure/functions'
import type { Container } from 'inversify'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { MoveHandler } from '../../src/handlers/moveCore.js'
import type { ILayerRepository } from '../../src/repos/layerRepository.js'
import type { ILocationRepository } from '../../src/repos/locationRepository.js'
import type { IAzureOpenAIClient } from '../../src/services/azureOpenAIClient.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import { getDefaultTestLocations, seedTestWorld } from '../helpers/seedTestWorld.js'

describe('MoveHandler hero prose on arrival', () => {
    let fixture: IntegrationTestFixture
    let container: Container
    let layerRepo: ILayerRepository
    let locationRepo: ILocationRepository

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
        container = await fixture.getContainer()
        layerRepo = await fixture.getLayerRepository()
        locationRepo = await fixture.getLocationRepository()

        // Seed a small test world with a hub that has a north exit.
        await seedTestWorld({
            locationRepository: locationRepo,
            blueprint: getDefaultTestLocations()
        })
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    async function createMockContext(): Promise<InvocationContext> {
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

    test('cache miss: arrival triggers generation and move response includes hero prose', async () => {
        const playerRepo = await fixture.getPlayerRepository()
        const { record: player } = await playerRepo.getOrCreate()

        // Place the player in the seeded test world hub.
        const hubLocationId = 'test-loc-hub'
        player.currentLocationId = hubLocationId
        await playerRepo.update(player)

        const destinationId = 'test-loc-north'

        // Ensure there is no hero layer at destination before moving.
        const existing = await layerRepo.queryLayerHistory(`loc:${destinationId}`, 'dynamic')
        assert.ok(!existing.some((l) => l.metadata?.role === 'hero'), 'Precondition: destination must not have hero prose')

        let called = 0
        const heroText = 'A narrow bridge spans a misty chasm, ropes humming in the wind.'
        const openaiStub: IAzureOpenAIClient = {
            generate: async () => {
                called += 1
                return {
                    content: heroText,
                    tokenUsage: { prompt: 10, completion: 20, total: 30 }
                }
            },
            healthCheck: async () => true
        }
        ;(await container.rebind<IAzureOpenAIClient>('IAzureOpenAIClient')).toConstantValue(openaiStub)

        const handler = container.get(MoveHandler)
        const ctx = await createMockContext()

        const req = {
            json: async () => ({ direction: 'north' }),
            query: new Map(),
            headers: new Map([
                ['content-type', 'application/json'],
                ['x-player-guid', player.id]
            ])
        } as unknown as HttpRequest

        const res = await handler.handle(req, ctx)
        assert.strictEqual(res.status, 200)

        const body = res.jsonBody as {
            success: boolean
            data?: {
                id: string
                name: string
                description: { text: string }
            }
        }
        assert.strictEqual(body.success, true)

        assert.strictEqual(body.data?.id, destinationId, 'Expected to move into the seeded north location')

        assert.strictEqual(called, 1, 'Expected Azure OpenAI client to be called on first arrival cache miss')

        // Response should reflect hero prose (replacing base description).
        assert.ok(body.data?.description?.text.includes('misty chasm'), 'Expected response description to include hero prose')

        // And the hero layer should be persisted for subsequent reads.
        const layers = await layerRepo.queryLayerHistory(`loc:${destinationId}`, 'dynamic')
        const heroLayer = layers.find((l) => l.metadata?.role === 'hero')
        assert.ok(heroLayer, 'Hero layer should be persisted on successful generation')
        assert.strictEqual(heroLayer?.value, heroText)
    })
})
