import type { HttpRequest, InvocationContext } from '@azure/functions'
import { Direction, STARTER_LOCATION_ID } from '@piquet-h/shared'
import type { Container } from 'inversify'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { TOKENS } from '../../src/di/tokens.js'
import { LocationLookHandler } from '../../src/handlers/locationLook.js'
import { ExitEdgeResult, generateExitsSummaryCache } from '../../src/repos/exitRepository.js'
import type { ILayerRepository } from '../../src/repos/layerRepository.js'
import type { AzureOpenAIClientConfig, IAzureOpenAIClient } from '../../src/services/azureOpenAIClient.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describe('LOOK Command Flow', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('generateExitsSummaryCache', () => {
        test('with multiple exits', () => {
            const exits: ExitEdgeResult[] = [
                { direction: 'north', toLocationId: 'loc1' },
                { direction: 'south', toLocationId: 'loc2' },
                { direction: 'east', toLocationId: 'loc3' }
            ]
            const summary = generateExitsSummaryCache(exits)
            assert.equal(summary, 'Exits: north, south, east')
        })

        test('with single exit', () => {
            const exits: ExitEdgeResult[] = [{ direction: 'north', toLocationId: 'loc1' }]
            const summary = generateExitsSummaryCache(exits)
            assert.equal(summary, 'Exits: north')
        })

        test('with no exits', () => {
            const exits: ExitEdgeResult[] = []
            const summary = generateExitsSummaryCache(exits)
            assert.equal(summary, 'No exits available.')
        })

        test('exits ordered canonically', () => {
            const exits: ExitEdgeResult[] = [
                { direction: 'up', toLocationId: 'loc4' },
                { direction: 'east', toLocationId: 'loc3' },
                { direction: 'north', toLocationId: 'loc1' },
                { direction: 'south', toLocationId: 'loc2' }
            ]
            const summary = generateExitsSummaryCache(exits)
            // Should be ordered: north, south, east, up
            assert.equal(summary, 'Exits: north, south, east, up')
        })

        test('ignores exit descriptions (direction-only cache)', () => {
            const exits: ExitEdgeResult[] = [
                { direction: 'north', toLocationId: 'loc1', description: 'through the archway' },
                { direction: 'east', toLocationId: 'loc2', description: 'past the market stalls' }
            ]
            const summary = generateExitsSummaryCache(exits)
            assert.equal(summary, 'Exits: north, east')
            assert.doesNotMatch(summary, /\(/, 'Summary should not include parenthesized descriptions')
        })
    })

    describe('Location repository - updateExitsSummaryCache', () => {
        test('updates cache successfully', async () => {
            const repo = await fixture.getLocationRepository()

            // Get a location
            const location = await repo.get(STARTER_LOCATION_ID)
            assert.ok(location, 'Location should exist')

            // Update cache
            const testCache = 'Exits: north, south'
            const result = await repo.updateExitsSummaryCache(STARTER_LOCATION_ID, testCache)
            assert.equal(result.updated, true, 'Cache should be updated')

            // Verify cache was stored
            const updated = await repo.get(STARTER_LOCATION_ID)
            assert.equal(updated?.exitsSummaryCache, testCache, 'Cache should match')
        })

        test('on missing location', async () => {
            const repo = await fixture.getLocationRepository()

            const result = await repo.updateExitsSummaryCache('nonexistent-id', 'Exits: north')
            assert.equal(result.updated, false, 'Should not update non-existent location')
        })
    })

    describe('Location repository - regenerateExitsSummaryCache', () => {
        test('generates direction-only cache (ignores descriptions)', async () => {
            const repo = await fixture.getLocationRepository()

            const fromId = STARTER_LOCATION_ID
            const toId = '11111111-1111-1111-1111-111111111111'

            await repo.upsert({
                id: toId,
                name: 'Dest',
                description: 'Destination',
                exits: []
            })

            // Ensure an exit that includes a description
            await repo.ensureExit(fromId, 'north', toId, 'through a mossy archway')

            // Regenerate cache and verify it does not include descriptions/parentheses
            await repo.regenerateExitsSummaryCache(fromId)
            const updated = await repo.get(fromId)
            assert.ok(updated, 'Location should exist')
            assert.ok(updated.exitsSummaryCache, 'Cache should exist after regeneration')
            assert.doesNotMatch(updated.exitsSummaryCache, /\(/, 'Cache should not include parenthesized descriptions')
            assert.ok(!updated.exitsSummaryCache.includes('through a mossy archway'), 'Cache should not include free-text exit description')
        })
    })

    describe('LOOK command flow scenarios', () => {
        test('cache hit path', async () => {
            const repo = await fixture.getLocationRepository()

            // Pre-populate cache
            await repo.updateExitsSummaryCache(STARTER_LOCATION_ID, 'Exits: north, east')

            const location = await repo.get(STARTER_LOCATION_ID)
            assert.ok(location, 'Location should exist')
            assert.equal(location.exitsSummaryCache, 'Exits: north, east', 'Cache should be present')
        })

        test('cache miss and regeneration', async () => {
            const repo = await fixture.getLocationRepository()

            // Get location
            const location = await repo.get(STARTER_LOCATION_ID)
            assert.ok(location, 'Location should exist')

            // Clear any existing cache to simulate cache miss
            if (location.exitsSummaryCache) {
                await repo.updateExitsSummaryCache(STARTER_LOCATION_ID, '')
            }

            // Get fresh copy without cache
            const locationWithoutCache = await repo.get(STARTER_LOCATION_ID)

            // Generate cache from exits
            const exitEdges: ExitEdgeResult[] = (locationWithoutCache?.exits || []).map((e) => ({
                direction: e.direction as Direction,
                toLocationId: e.to || '',
                description: e.description
            }))
            const generatedCache = generateExitsSummaryCache(exitEdges)

            // Persist cache
            await repo.updateExitsSummaryCache(STARTER_LOCATION_ID, generatedCache)

            // Verify cache was stored
            const updated = await repo.get(STARTER_LOCATION_ID)
            assert.ok(updated?.exitsSummaryCache, 'Cache should exist after generation')
            assert.equal(updated?.exitsSummaryCache, generatedCache, 'Cache should match generated value')
        })

        test('repeated LOOK returns cache', async () => {
            const repo = await fixture.getLocationRepository()

            // First LOOK - generate cache
            const location1 = await repo.get(STARTER_LOCATION_ID)
            assert.ok(location1, 'Location should exist')

            const exitEdges: ExitEdgeResult[] = (location1.exits || []).map((e) => ({
                direction: e.direction as Direction,
                toLocationId: e.to || '',
                description: e.description
            }))
            const generatedCache = generateExitsSummaryCache(exitEdges)
            await repo.updateExitsSummaryCache(STARTER_LOCATION_ID, generatedCache)

            // Second LOOK - should return cached value
            const location2 = await repo.get(STARTER_LOCATION_ID)
            assert.equal(location2?.exitsSummaryCache, generatedCache, 'Cache should be returned on repeat LOOK')
        })
    })

    describe('LocationLookHandler - hero prose generation gating', () => {
        let container: Container
        let layerRepo: ILayerRepository

        beforeEach(async () => {
            container = await fixture.getContainer()
            layerRepo = await fixture.getLayerRepository()
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

        function bindAzureOpenAI(openaiStub: IAzureOpenAIClient): void {
            // Inversify v7 removed fluent rebind().toConstantValue().
            // Also: LocationLookHandler delegates to HeroProseGenerator, which intentionally
            // short-circuits if AzureOpenAIConfig.endpoint is empty.
            if (container.isBound(TOKENS.AzureOpenAIClient)) {
                container.unbind(TOKENS.AzureOpenAIClient)
            }
            if (container.isBound(TOKENS.AzureOpenAIConfig)) {
                container.unbind(TOKENS.AzureOpenAIConfig)
            }

            const config: AzureOpenAIClientConfig = {
                endpoint: 'https://test.openai.azure.com',
                model: 'gpt-4-test'
            }

            container.bind<AzureOpenAIClientConfig>(TOKENS.AzureOpenAIConfig).toConstantValue(config)
            container.bind<IAzureOpenAIClient>(TOKENS.AzureOpenAIClient).toConstantValue(openaiStub)
        }

        test('cache hit: allows hero prose generation (no canonical writes)', async () => {
            const repo = await fixture.getLocationRepository()

            // Pre-populate exitsSummaryCache to avoid canonical write
            await repo.updateExitsSummaryCache(STARTER_LOCATION_ID, 'Exits: north, south')

            const location = await repo.get(STARTER_LOCATION_ID)
            assert.ok(location?.exitsSummaryCache, 'Precondition: cache must exist')

            // Ensure no hero prose exists initially
            const existingLayers = await layerRepo.queryLayerHistory(`loc:${STARTER_LOCATION_ID}`, 'dynamic')
            assert.ok(!existingLayers.some((l) => l.metadata?.role === 'hero'), 'Precondition: no hero prose should exist')

            let openaiCalled = 0
            const heroText = 'The ancient hall echoes with whispers of forgotten kings.'
            const openaiStub: IAzureOpenAIClient = {
                generate: async () => {
                    openaiCalled += 1
                    return {
                        content: heroText,
                        tokenUsage: { prompt: 10, completion: 20, total: 30 }
                    }
                },
                healthCheck: async () => true
            }
            bindAzureOpenAI(openaiStub)

            const handler = container.get(LocationLookHandler)
            const ctx = await createMockContext()

            const req = {
                params: { locationId: STARTER_LOCATION_ID },
                query: new Map(),
                headers: new Map()
            } as unknown as HttpRequest

            const res = await handler.handle(req, ctx)
            assert.strictEqual(res.status, 200, 'Should return 200 OK')

            // Hero prose generation should have been attempted
            assert.strictEqual(openaiCalled, 1, 'Azure OpenAI should be called when no canonical writes planned')

            // Hero layer should be persisted
            const layers = await layerRepo.queryLayerHistory(`loc:${STARTER_LOCATION_ID}`, 'dynamic')
            const heroLayer = layers.find((l) => l.metadata?.role === 'hero')
            assert.ok(heroLayer, 'Hero layer should be persisted on cache hit')
            assert.strictEqual(heroLayer?.value, heroText)
        })

        test('cache miss: skips SYNCHRONOUS hero prose generation but fires background (canonical writes planned)', async () => {
            const repo = await fixture.getLocationRepository()

            // Get location without cache (or clear it) to simulate cache miss
            const location = await repo.get(STARTER_LOCATION_ID)
            if (location?.exitsSummaryCache) {
                await repo.updateExitsSummaryCache(STARTER_LOCATION_ID, '')
            }

            const locationWithoutCache = await repo.get(STARTER_LOCATION_ID)
            assert.ok(!locationWithoutCache?.exitsSummaryCache, 'Precondition: cache must not exist')

            // Ensure no hero prose exists initially
            const existingLayers = await layerRepo.queryLayerHistory(`loc:${STARTER_LOCATION_ID}`, 'dynamic')
            assert.ok(!existingLayers.some((l) => l.metadata?.role === 'hero'), 'Precondition: no hero prose should exist')

            const heroText = 'Background-fired hero prose after canonical write.'
            let openaiCalled = 0
            const openaiStub: IAzureOpenAIClient = {
                generate: async () => {
                    openaiCalled += 1
                    return {
                        content: heroText,
                        tokenUsage: { prompt: 10, completion: 20, total: 30 }
                    }
                },
                healthCheck: async () => true
            }
            bindAzureOpenAI(openaiStub)

            const handler = container.get(LocationLookHandler)
            const ctx = await createMockContext()

            const req = {
                params: { locationId: STARTER_LOCATION_ID },
                query: new Map(),
                headers: new Map()
            } as unknown as HttpRequest

            const res = await handler.handle(req, ctx)
            assert.strictEqual(res.status, 200, 'Should return 200 OK immediately with baseline prose')

            // Handler returns immediately — synchronous generation was skipped.
            // Background generation fires asynchronously; give it time to complete.
            await new Promise((resolve) => setTimeout(resolve, 100))

            // Background generation should have fired and persisted the hero layer.
            assert.ok(openaiCalled >= 1, 'Background generation should have called AOAI')
            const layers = await layerRepo.queryLayerHistory(`loc:${STARTER_LOCATION_ID}`, 'dynamic')
            const heroLayer = layers.find((l) => l.metadata?.role === 'hero')
            assert.ok(heroLayer, 'Background generation should have persisted a hero layer')

            // Canonical write should also have happened
            const updated = await repo.get(STARTER_LOCATION_ID)
            assert.ok(updated?.exitsSummaryCache, 'exitsSummaryCache should be persisted (canonical write)')
        })

        test('cache miss with AOAI configured: returns 200 immediately then fires background generation', async () => {
            const repo = await fixture.getLocationRepository()

            // Clear cache to simulate cache miss (canonical writes planned)
            const location = await repo.get(STARTER_LOCATION_ID)
            if (location?.exitsSummaryCache) {
                await repo.updateExitsSummaryCache(STARTER_LOCATION_ID, '')
            }

            let openaiCalled = 0
            const openaiStub: IAzureOpenAIClient = {
                generate: async () => {
                    openaiCalled += 1
                    return {
                        content: 'Prose generated in background.',
                        tokenUsage: { prompt: 10, completion: 20, total: 30 }
                    }
                },
                healthCheck: async () => true
            }
            bindAzureOpenAI(openaiStub)

            const handler = container.get(LocationLookHandler)
            const ctx = await createMockContext()

            const req = {
                params: { locationId: STARTER_LOCATION_ID },
                query: new Map(),
                headers: new Map()
            } as unknown as HttpRequest

            const res = await handler.handle(req, ctx)
            assert.strictEqual(res.status, 200, 'Should return 200 OK immediately')

            // Allow background generation to complete.
            await new Promise((resolve) => setTimeout(resolve, 100))

            // Background generation should have fired (stale-while-revalidate).
            assert.ok(openaiCalled >= 1, 'AOAI should be called via background generation even when canonical writes planned')
        })

        test('cache hit with AOAI timeout: falls back safely with no 5xx, then fires background retry', async () => {
            const repo = await fixture.getLocationRepository()

            // Pre-populate cache
            await repo.updateExitsSummaryCache(STARTER_LOCATION_ID, 'Exits: north')

            let openaiCalled = 0
            const openaiStub: IAzureOpenAIClient = {
                generate: async () => {
                    openaiCalled += 1
                    // Simulate a slow response — sync call will time out, background will succeed.
                    await new Promise((resolve) => setTimeout(resolve, 15))
                    return {
                        content: 'Background-recovered prose after sync timeout.',
                        tokenUsage: { prompt: 10, completion: 15, total: 25 }
                    }
                },
                healthCheck: async () => true
            }
            bindAzureOpenAI(openaiStub)

            const original = process.env.HERO_PROSE_TIMEOUT_MS
            process.env.HERO_PROSE_TIMEOUT_MS = '1' // force sync to time out

            try {
                const handler = container.get(LocationLookHandler)
                const ctx = await createMockContext()

                const req = {
                    params: { locationId: STARTER_LOCATION_ID },
                    query: new Map(),
                    headers: new Map()
                } as unknown as HttpRequest

                const res = await handler.handle(req, ctx)

                // Should fall back gracefully - no 5xx error
                assert.strictEqual(res.status, 200, 'Should return 200 OK even on AOAI timeout')

                // Response should still contain location data (using base description)
                const body = res.jsonBody as { data?: { id?: string; name?: string; description?: unknown } }
                const data = body.data || body
                assert.ok(data.id, 'Response should contain location ID')
                assert.ok(data.name, 'Response should contain location name')
                assert.ok(data.description, 'Response should contain description')

                // Wait for background retry to complete (mock takes 15ms per call).
                await new Promise((resolve) => setTimeout(resolve, 200))

                // Background should have fired: sync call (1) + background call (2) = at least 2
                assert.ok(openaiCalled >= 2, `AOAI should be called by sync and background (got ${openaiCalled})`)

                // Hero layer should now be persisted
                const layers = await layerRepo.queryLayerHistory(`loc:${STARTER_LOCATION_ID}`, 'dynamic')
                const heroLayer = layers.find((l) => l.metadata?.role === 'hero')
                assert.ok(heroLayer, 'Background retry should have persisted hero layer')
            } finally {
                if (original === undefined) {
                    delete process.env.HERO_PROSE_TIMEOUT_MS
                } else {
                    process.env.HERO_PROSE_TIMEOUT_MS = original
                }
            }
        })
    })
})
