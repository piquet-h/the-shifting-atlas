/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for EnvironmentChangeHandler (Issue #258 - Generic Shared World Effect Handler)
 *
 * Design Philosophy (per tenets.md #7):
 * - Handler captures WHAT changed (structured metadata)
 * - AI generates HOW to describe it (narrative immersion)
 */
import type { Container } from 'inversify'
import assert from 'node:assert'
import { beforeEach, describe, test } from 'node:test'
import type { IDescriptionRepository } from '../../src/repos/descriptionRepository.js'
import { queueProcessWorldEvent } from '../../src/worldEvents/queueProcessWorldEvent.js'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'
import type { MockTelemetryClient } from '../mocks/MockTelemetryClient.js'

describe('EnvironmentChangeHandler', () => {
    let fixture: UnitTestFixture
    let container: Container
    let telemetry: MockTelemetryClient
    let descriptionRepo: IDescriptionRepository

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
        container = await fixture.getContainer()
        telemetry = await fixture.getTelemetryClient()
        descriptionRepo = container.get<IDescriptionRepository>('IDescriptionRepository')
    })

    function createEnvironmentEvent(overrides?: Record<string, unknown>): Record<string, unknown> {
        return {
            eventId: '10000000-0000-4000-8000-000000000001',
            type: 'Location.Environment.Changed',
            occurredUtc: '2025-11-25T12:00:00.000Z',
            actor: { kind: 'player', id: '20000000-0000-4000-8000-000000000002' },
            correlationId: '30000000-0000-4000-8000-000000000003',
            idempotencyKey: 'env:loc-forest:fire:1',
            version: 1,
            payload: {
                locationId: 'loc-forest',
                changeType: 'fire',
                severity: 'moderate',
                description: 'Fire has broken out in the forest',
                duration: 'temporary'
            },
            ...overrides
        }
    }

    test('should add environment layer with structured metadata (success)', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createEnvironmentEvent({ idempotencyKey: 'env:loc-forest:fire:success' })
        await queueProcessWorldEvent(event, ctx as any)

        const logs = ctx.getLogs()
        const handlerLog = logs.find((l) => l[0] === 'EnvironmentChangeHandler applied')
        assert.ok(handlerLog, 'EnvironmentChangeHandler should apply layer')
        assert.ok(handlerLog[1].created, 'Layer should be created')

        const layers = await descriptionRepo.getLayersForLocation('loc-forest')
        assert.strictEqual(layers.length, 1, 'Should have one description layer')
        assert.strictEqual(layers[0].type, 'structural_event', 'Layer type should be structural_event')
        assert.strictEqual(layers[0].attributes?.changeType, 'fire', 'changeType attribute should be stored')
        assert.strictEqual(layers[0].attributes?.severity, 'moderate', 'severity attribute should be stored')
    })

    test('should emit HandlerInvoked telemetry with changeType', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createEnvironmentEvent({ idempotencyKey: 'env:loc-forest:fire:telemetry' })
        await queueProcessWorldEvent(event, ctx as any)

        const invokedEvents = telemetry.events.filter((e) => e.name === 'World.Event.HandlerInvoked')
        const success = invokedEvents.find(
            (e) => e.properties?.handler === 'EnvironmentChangeHandler' && e.properties?.outcome === 'success'
        )
        assert.ok(success, 'Handler success telemetry should be emitted')
        assert.strictEqual(success?.properties?.changeType, 'fire', 'changeType should be in telemetry')
    })

    test('should emit validation-failed for missing locationId', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createEnvironmentEvent({
            idempotencyKey: 'env:missing-loc:validation',
            payload: { changeType: 'flood', severity: 'high' }
        })
        await queueProcessWorldEvent(event, ctx as any)

        const invokedEvents = telemetry.events.filter((e) => e.name === 'World.Event.HandlerInvoked')
        const validation = invokedEvents.find(
            (e) => e.properties?.handler === 'EnvironmentChangeHandler' && e.properties?.outcome === 'validation-failed'
        )
        assert.ok(validation, 'Validation failure telemetry should be emitted')
    })

    test('should emit validation-failed for missing changeType', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createEnvironmentEvent({
            idempotencyKey: 'env:missing-type:validation',
            payload: { locationId: 'loc-test', severity: 'low' }
        })
        await queueProcessWorldEvent(event, ctx as any)

        const invokedEvents = telemetry.events.filter((e) => e.name === 'World.Event.HandlerInvoked')
        const validation = invokedEvents.find(
            (e) => e.properties?.handler === 'EnvironmentChangeHandler' && e.properties?.outcome === 'validation-failed'
        )
        assert.ok(validation, 'Validation failure for missing changeType should be emitted')
    })

    test('should handle various environment change types', async () => {
        const changeTypes = ['fire', 'flood', 'collapse', 'magic', 'weather', 'custom-effect']

        for (const changeType of changeTypes) {
            const ctx = await fixture.createInvocationContext()
            const event = createEnvironmentEvent({
                idempotencyKey: `env:loc-test:${changeType}:generic`,
                payload: {
                    locationId: `loc-${changeType}`,
                    changeType,
                    severity: 'moderate',
                    description: `${changeType} has occurred`
                }
            })
            await queueProcessWorldEvent(event, ctx as any)

            const layers = await descriptionRepo.getLayersForLocation(`loc-${changeType}`)
            assert.strictEqual(layers.length, 1, `Should have one layer for ${changeType}`)
            assert.strictEqual(layers[0].attributes?.changeType, changeType, `changeType should be ${changeType}`)
        }
    })

    test('should store optional expiresAt for temporary effects', async () => {
        const expiresAt = '2025-11-26T00:00:00.000Z'
        const ctx = await fixture.createInvocationContext()
        const event = createEnvironmentEvent({
            idempotencyKey: 'env:loc-test:expiring',
            payload: {
                locationId: 'loc-expiring',
                changeType: 'storm',
                severity: 'high',
                duration: 'temporary',
                expiresAt
            }
        })
        await queueProcessWorldEvent(event, ctx as any)

        const layers = await descriptionRepo.getLayersForLocation('loc-expiring')
        assert.strictEqual(layers.length, 1, 'Should have one layer')
        assert.strictEqual(layers[0].expiresAt, expiresAt, 'expiresAt should be stored')
        assert.strictEqual(layers[0].attributes?.duration, 'temporary', 'duration should be temporary')
    })

    test('should use description as layer content for AI context', async () => {
        const description = 'A magical barrier shimmers into existence'
        const ctx = await fixture.createInvocationContext()
        const event = createEnvironmentEvent({
            idempotencyKey: 'env:loc-test:magic-desc',
            payload: {
                locationId: 'loc-magic',
                changeType: 'barrier',
                description
            }
        })
        await queueProcessWorldEvent(event, ctx as any)

        const layers = await descriptionRepo.getLayersForLocation('loc-magic')
        assert.strictEqual(layers.length, 1, 'Should have one layer')
        assert.strictEqual(layers[0].content, description, 'Layer content should be the AI context description')
    })

    test('should bubble repository errors for retry', async () => {
        const failingRepo: IDescriptionRepository = {
            async getLayersForLocation() {
                return []
            },
            async addLayer() {
                throw new Error('Cosmos transient failure')
            },
            async archiveLayer() {
                return { archived: false }
            },
            async getLayersForLocations() {
                return new Map()
            },
            async getAllLayers() {
                return []
            },
            async updateIntegrityHash() {
                return { updated: false }
            }
        }

        container.unbind('IDescriptionRepository')
        container.bind<IDescriptionRepository>('IDescriptionRepository').toConstantValue(failingRepo)

        const ctx = await fixture.createInvocationContext()
        const event = createEnvironmentEvent({ idempotencyKey: 'env:error-bubble' })
        let threw = false
        try {
            await queueProcessWorldEvent(event, ctx as any)
        } catch {
            threw = true
        }
        assert.ok(threw, 'Repository error should bubble for retry')

        const errorTelemetry = telemetry.events.find(
            (e) =>
                e.name === 'World.Event.HandlerInvoked' &&
                e.properties?.handler === 'EnvironmentChangeHandler' &&
                e.properties?.outcome === 'error'
        )
        assert.ok(errorTelemetry, 'Error outcome telemetry should be emitted')
    })
})
