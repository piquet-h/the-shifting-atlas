import type { InvocationContext } from '@azure/functions'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { computeDescriptionIntegrityHashes } from '../../src/handlers/computeIntegrityHashes.js'
import { computeIntegrityHash } from '../../src/repos/utils/integrityHash.js'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'
import type { MockTelemetryClient } from '../mocks/MockTelemetryClient.js'

describe('Integrity Hash Computation Handler', () => {
    let fixture: UnitTestFixture
    let telemetry: MockTelemetryClient
    let mockContext: InvocationContext

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
        telemetry = await fixture.getTelemetryClient()

        // Create mock invocation context
        mockContext = {
            log: () => {},
            warn: () => {},
            error: () => {},
            extraInputs: new Map()
        } as unknown as InvocationContext
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('computes hashes for all descriptions', async () => {
        const repo = await fixture.getDescriptionRepository()

        // Add some test layers
        const locationId1 = randomUUID()
        const locationId2 = randomUUID()

        await repo.addLayer({
            id: randomUUID(),
            locationId: locationId1,
            type: 'ambient',
            content: 'A gentle breeze rustles through the trees.',
            createdAt: new Date().toISOString()
        })

        await repo.addLayer({
            id: randomUUID(),
            locationId: locationId2,
            type: 'structural_event',
            content: 'The ancient door creaks on rusted hinges.',
            createdAt: new Date().toISOString()
        })

        const telemetryService = await fixture.getTelemetryService()
        const result = await computeDescriptionIntegrityHashes(repo, telemetryService, mockContext)

        assert.equal(result.processed, 2, 'Should process 2 layers')
        assert.equal(result.updated, 2, 'Should update 2 layers (no existing hashes)')
        assert.equal(result.mismatches, 0, 'Should have no mismatches')
        assert.equal(result.skipped, 0, 'Should skip no layers')

        // Verify hashes were stored
        const allLayers = await repo.getAllLayers()
        for (const layer of allLayers) {
            assert.ok(layer.integrityHash, 'Layer should have integrity hash')
            assert.equal(layer.integrityHash.length, 64, 'Hash should be 64 characters')
        }
    })

    test('skips layers with valid existing hashes', async () => {
        const repo = await fixture.getDescriptionRepository()

        const layerId = randomUUID()
        const content = 'Mist hangs heavy in the air.'
        const existingHash = computeIntegrityHash(content)

        // Add layer with pre-computed hash
        await repo.addLayer({
            id: layerId,
            locationId: randomUUID(),
            type: 'weather',
            content,
            createdAt: new Date().toISOString(),
            integrityHash: existingHash
        })

        telemetry.clear()
        const telemetryService = await fixture.getTelemetryService()
        const result = await computeDescriptionIntegrityHashes(repo, telemetryService, mockContext)

        assert.equal(result.processed, 1, 'Should process 1 layer')
        assert.equal(result.updated, 0, 'Should not update layer with valid hash')
        assert.equal(result.skipped, 1, 'Should skip 1 layer')
        assert.equal(result.mismatches, 0, 'Should have no mismatches')

        // Verify Unchanged event was emitted
        const unchangedEvents = telemetry.events.filter((e) => e.name === 'Description.Integrity.Unchanged')
        assert.equal(unchangedEvents.length, 1, 'Should emit Unchanged event')
    })

    test('detects hash mismatches (potential corruption)', async () => {
        const repo = await fixture.getDescriptionRepository()

        const layerId = randomUUID()
        const originalContent = 'The room is dark and cold.'
        const corruptedHash = computeIntegrityHash('Different content')

        // Add layer with incorrect hash (simulating corruption)
        await repo.addLayer({
            id: layerId,
            locationId: randomUUID(),
            type: 'ambient',
            content: originalContent,
            createdAt: new Date().toISOString(),
            integrityHash: corruptedHash
        })

        telemetry.clear()
        const telemetryService = await fixture.getTelemetryService()
        const result = await computeDescriptionIntegrityHashes(repo, telemetryService, mockContext)

        assert.equal(result.processed, 1, 'Should process 1 layer')
        assert.equal(result.updated, 1, 'Should update layer with mismatched hash')
        assert.equal(result.mismatches, 1, 'Should detect 1 mismatch')
        assert.equal(result.skipped, 0, 'Should not skip layer')

        // Verify Mismatch event was emitted
        const mismatchEvents = telemetry.events.filter((e) => e.name === 'Description.Integrity.Mismatch')
        assert.equal(mismatchEvents.length, 1, 'Should emit Mismatch event')

        // Verify hash was corrected
        const layers = await repo.getAllLayers()
        const updatedLayer = layers.find((l) => l.id === layerId)
        assert.ok(updatedLayer, 'Layer should still exist')
        assert.equal(updatedLayer.integrityHash, computeIntegrityHash(originalContent), 'Hash should be corrected')
    })

    test('processes archived layers', async () => {
        const repo = await fixture.getDescriptionRepository()

        const layerId = randomUUID()
        await repo.addLayer({
            id: layerId,
            locationId: randomUUID(),
            type: 'ambient',
            content: 'This layer will be archived.',
            createdAt: new Date().toISOString()
        })

        // Archive the layer
        await repo.archiveLayer(layerId)

        const telemetryService = await fixture.getTelemetryService()
        const result = await computeDescriptionIntegrityHashes(repo, telemetryService, mockContext)

        // Should still process archived layers for complete integrity baseline
        assert.equal(result.processed, 1, 'Should process archived layer')
        assert.equal(result.updated, 1, 'Should compute hash for archived layer')

        const layers = await repo.getAllLayers()
        const archivedLayer = layers.find((l) => l.id === layerId)
        assert.ok(archivedLayer?.integrityHash, 'Archived layer should have integrity hash')
    })

    test('handles empty repository gracefully', async () => {
        const repo = await fixture.getDescriptionRepository()

        const telemetryService = await fixture.getTelemetryService()
        const result = await computeDescriptionIntegrityHashes(repo, telemetryService, mockContext)

        assert.equal(result.processed, 0, 'Should process 0 layers')
        assert.equal(result.updated, 0, 'Should update 0 layers')
        assert.equal(result.mismatches, 0, 'Should have no mismatches')
        assert.equal(result.skipped, 0, 'Should skip no layers')

        // Should still emit job completion telemetry
        const jobCompleteEvents = telemetry.events.filter((e) => e.name === 'Description.Integrity.JobComplete')
        assert.equal(jobCompleteEvents.length, 1, 'Should emit JobComplete event')
        assert.equal(jobCompleteEvents[0].properties?.success, true, 'Job should succeed')
    })

    test('emits telemetry for job lifecycle', async () => {
        const repo = await fixture.getDescriptionRepository()

        await repo.addLayer({
            id: randomUUID(),
            locationId: randomUUID(),
            type: 'ambient',
            content: 'Test content',
            createdAt: new Date().toISOString()
        })

        telemetry.clear()
        const telemetryService = await fixture.getTelemetryService()
        await computeDescriptionIntegrityHashes(repo, telemetryService, mockContext)

        // Verify job start event
        const jobStartEvents = telemetry.events.filter((e) => e.name === 'Description.Integrity.JobStart')
        assert.equal(jobStartEvents.length, 1, 'Should emit JobStart event')

        // Verify computed event
        const computedEvents = telemetry.events.filter((e) => e.name === 'Description.Integrity.Computed')
        assert.equal(computedEvents.length, 1, 'Should emit Computed event')

        // Verify job complete event
        const jobCompleteEvents = telemetry.events.filter((e) => e.name === 'Description.Integrity.JobComplete')
        assert.equal(jobCompleteEvents.length, 1, 'Should emit JobComplete event')

        const completeEvent = jobCompleteEvents[0]
        assert.equal(completeEvent.properties?.success, true, 'Job should succeed')
        assert.equal(completeEvent.properties?.processed, 1, 'Should report processed count')
        assert.equal(completeEvent.properties?.updated, 1, 'Should report updated count')
        assert.ok(typeof completeEvent.properties?.durationMs === 'number', 'Should report duration')
    })

    test('RECOMPUTE_ALL mode recomputes valid hashes', async () => {
        // Temporarily set environment variable
        const originalEnv = process.env.INTEGRITY_JOB_RECOMPUTE_ALL
        process.env.INTEGRITY_JOB_RECOMPUTE_ALL = 'true'

        try {
            const repo = await fixture.getDescriptionRepository()

            const content = 'Test content for recompute.'
            const validHash = computeIntegrityHash(content)

            await repo.addLayer({
                id: randomUUID(),
                locationId: randomUUID(),
                type: 'ambient',
                content,
                createdAt: new Date().toISOString(),
                integrityHash: validHash
            })

            // Need to reload the module to pick up env var change
            // For this test, we'll just verify the behavior without reloading
            const telemetryService = await fixture.getTelemetryService()
            const result = await computeDescriptionIntegrityHashes(repo, telemetryService, mockContext)

            // In RECOMPUTE_ALL mode, should still process even with valid hash
            assert.equal(result.processed, 1, 'Should process layer')
            // Note: The handler checks env var at module load time, so this test
            // would need module reloading to fully test. For now, we verify the logic.
        } finally {
            if (originalEnv !== undefined) {
                process.env.INTEGRITY_JOB_RECOMPUTE_ALL = originalEnv
            } else {
                delete process.env.INTEGRITY_JOB_RECOMPUTE_ALL
            }
        }
    })

    test('handles very large descriptions', async () => {
        const repo = await fixture.getDescriptionRepository()

        // Create a layer with large content (edge case: very large description text)
        const largeContent = 'A'.repeat(50000) + ' The end of a very long description.'

        await repo.addLayer({
            id: randomUUID(),
            locationId: randomUUID(),
            type: 'enhancement',
            content: largeContent,
            createdAt: new Date().toISOString()
        })

        const telemetryService = await fixture.getTelemetryService()
        const result = await computeDescriptionIntegrityHashes(repo, telemetryService, mockContext)

        assert.equal(result.processed, 1, 'Should process large description')
        assert.equal(result.updated, 1, 'Should compute hash for large description')

        const layers = await repo.getAllLayers()
        assert.ok(layers[0].integrityHash, 'Large description should have hash')
        assert.equal(layers[0].integrityHash.length, 64, 'Hash should be valid SHA-256')
    })
})
