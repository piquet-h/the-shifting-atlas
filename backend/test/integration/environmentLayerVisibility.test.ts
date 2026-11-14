/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { TOKENS } from '../../src/di/tokens.js'
import { computeDescriptionIntegrityHashes } from '../../src/handlers/computeIntegrityHashes.js'
import type { IDescriptionRepository } from '../../src/repos/descriptionRepository.js'
import type { ILayerRepository } from '../../src/repos/layerRepository.js'
import { DescriptionComposer } from '../../src/services/descriptionComposer.js'
import { TelemetryService } from '../../src/telemetry/TelemetryService.js'
import { queueProcessWorldEvent } from '../../src/worldEvents/queueProcessWorldEvent.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describe('Unified Description & Layer Persistence (EnvironmentChange + Composer + Integrity Job)', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('Location.Environment.Changed layers are visible to DescriptionComposer and hashed alongside ILayerRepository layers', async () => {
        const container = await fixture.getContainer()
        const composer = container.get(DescriptionComposer)
        const layerRepo = container.get<ILayerRepository>(TOKENS.LayerRepository)
        const descriptionRepo = container.get<IDescriptionRepository>(TOKENS.DescriptionRepository)
        const telemetryService = container.get(TelemetryService)

        const locationId = randomUUID()
        const ctx = await fixture.createInvocationContext()

        // 1. Process Location.Environment.Changed event
        await queueProcessWorldEvent(
            {
                eventId: randomUUID(),
                type: 'Location.Environment.Changed',
                occurredUtc: '2026-11-14T02:00:00.000Z',
                actor: { kind: 'player', id: randomUUID() },
                correlationId: randomUUID(),
                idempotencyKey: `env:${locationId}:fire:1`,
                version: 1,
                payload: {
                    locationId,
                    changeType: 'fire',
                    severity: 'moderate',
                    description: 'Smoke curls upward from scorched planks.',
                    duration: 'temporary',
                    actionIntent: {
                        rawInput: 'light the planks',
                        parsedIntent: { verb: 'interact' },
                        validationResult: { success: true }
                    }
                }
            },
            ctx as any
        )

        // 2. DescriptionComposer immediately includes the environment layer in compiled location prose
        const compiled = await composer.compileForLocation(
            locationId,
            { timestamp: '2026-11-14T02:01:00.000Z' },
            { baseDescription: 'Weathered timber planks stretch over dark fiord water.' }
        )
        assert.match(compiled.text, /Weathered timber planks stretch over dark fiord water\./)
        assert.match(compiled.text, /Smoke curls upward from scorched planks\./)

        // 3. Add a second layer directly via ILayerRepository (as HeroProseGenerator / AgentProposalApplicator do)
        await layerRepo.setLayerForLocation(locationId, 'ambient', 0, null, 'Cold mist drifts off the sound.')

        // 4. Integrity hash job processes BOTH layers through IDescriptionRepository
        const hashSummary = await computeDescriptionIntegrityHashes(descriptionRepo, telemetryService, ctx as any)
        assert.equal(hashSummary.processed, 2)
        assert.equal(hashSummary.updated, 2)
        assert.equal(hashSummary.mismatches, 0)
    })
})
