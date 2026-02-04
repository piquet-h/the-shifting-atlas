/**
 * MoveHandler Hero Prose (No Generation) Integration Test
 *
 * Intent: Verify that MoveHandler does NOT trigger hero prose generation on arrival.
 * Per event-classification-matrix.md, movement is an action/canonical-write path
 * and must not wait on AI/narration generation. Hero prose should only be generated
 * via perception paths (look/examine handlers).
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

describe('MoveHandler does not generate hero prose on arrival', () => {
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

    test('move succeeds without calling hero prose generation', async () => {
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

        // Stub OpenAI client to track if it's called (it should NOT be)
        let called = 0
        const openaiStub: IAzureOpenAIClient = {
            generate: async () => {
                called += 1
                return {
                    content: 'This should not be generated',
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
        assert.strictEqual(res.status, 200, 'Move should succeed')

        const body = res.jsonBody as {
            success: boolean
            data?: {
                id: string
                name: string
                description: { text: string }
            }
        }
        assert.strictEqual(body.success, true, 'Move should be marked as successful')
        assert.strictEqual(body.data?.id, destinationId, 'Expected to move into the seeded north location')

        // CRITICAL: Verify that OpenAI client was NOT called during move
        assert.strictEqual(called, 0, 'Expected Azure OpenAI client NOT to be called during move (hero prose generation should not happen)')

        // Verify no hero layer was persisted
        const layers = await layerRepo.queryLayerHistory(`loc:${destinationId}`, 'dynamic')
        const heroLayer = layers.find((l) => l.metadata?.role === 'hero')
        assert.strictEqual(heroLayer, undefined, 'Hero layer should NOT be created during move')

        // Response should use base description (no hero prose)
        assert.ok(body.data?.description?.text, 'Response should have a description')
    })
})
