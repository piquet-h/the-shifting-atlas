/**
 * Tests for AgentProposalApplicator
 *
 * Covers:
 * - Layer.Add: creates a location layer in the repository
 * - Ambience.Generate: creates an ambient layer using deterministic or explicit content
 * - NPC.Dialogue: returns applied=true (telemetry-only for now)
 * - pickAmbientContent: deterministic output for same inputs
 */
import assert from 'node:assert'
import { beforeEach, describe, test } from 'node:test'
import { AgentProposalApplicator, pickAmbientContent } from '../../src/services/AgentProposalApplicator.js'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'

describe('AgentProposalApplicator', () => {
    let fixture: UnitTestFixture
    let applicator: AgentProposalApplicator

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
        const container = await fixture.getContainer()
        applicator = container.get(AgentProposalApplicator)
    })

    const LOCATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const CORRELATION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

    // --- Layer.Add ------------------------------------------------------------

    test('Layer.Add: creates ambient layer and returns applied=true with layerId', async () => {
        const action = {
            actionType: 'Layer.Add' as const,
            scopeKey: `loc:${LOCATION_ID}`,
            params: {
                locationId: LOCATION_ID,
                layerContent: 'A gentle hum fills the air.',
                layerType: 'ambient'
            }
        }

        const result = await applicator.apply(action, CORRELATION_ID, 0)

        assert.strictEqual(result.applied, true)
        assert.strictEqual(result.actionType, 'Layer.Add')
        assert.ok(result.layerId, 'layerId should be returned')

        // Verify layer was actually stored
        const layerRepo = await fixture.getLayerRepository()
        const layer = await layerRepo.getActiveLayerForLocation(LOCATION_ID, 'ambient', 0)
        assert.ok(layer, 'Layer should be persisted')
        assert.strictEqual(layer?.value, 'A gentle hum fills the air.')
        assert.strictEqual(layer?.metadata?.['authoredBy'], 'agent')
    })

    test('Layer.Add: supports non-ambient layer types', async () => {
        const action = {
            actionType: 'Layer.Add' as const,
            scopeKey: `loc:${LOCATION_ID}`,
            params: {
                locationId: LOCATION_ID,
                layerContent: 'Rain lashes the windows.',
                layerType: 'weather'
            }
        }

        const result = await applicator.apply(action, CORRELATION_ID, 0)

        assert.strictEqual(result.applied, true)
        const layerRepo = await fixture.getLayerRepository()
        const layer = await layerRepo.getActiveLayerForLocation(LOCATION_ID, 'weather', 0)
        assert.ok(layer, 'Weather layer should be persisted')
        assert.strictEqual(layer?.value, 'Rain lashes the windows.')
    })

    test('Layer.Add: defaults layerType to ambient when not provided', async () => {
        const action = {
            actionType: 'Layer.Add' as const,
            scopeKey: `loc:${LOCATION_ID}`,
            params: {
                locationId: LOCATION_ID,
                layerContent: 'A quiet afternoon.'
                // no layerType
            }
        }

        const result = await applicator.apply(action, CORRELATION_ID, 0)

        assert.strictEqual(result.applied, true)
        const layerRepo = await fixture.getLayerRepository()
        const layer = await layerRepo.getActiveLayerForLocation(LOCATION_ID, 'ambient', 0)
        assert.ok(layer, 'Default ambient layer should be created')
    })

    // --- Ambience.Generate ----------------------------------------------------

    test('Ambience.Generate: creates ambient layer with deterministic content', async () => {
        const locId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
        const action = {
            actionType: 'Ambience.Generate' as const,
            scopeKey: `loc:${locId}`,
            params: { locationId: locId }
        }

        const result = await applicator.apply(action, CORRELATION_ID, 5)

        assert.strictEqual(result.applied, true)
        assert.strictEqual(result.actionType, 'Ambience.Generate')
        assert.ok(result.layerId, 'layerId should be returned')

        const layerRepo = await fixture.getLayerRepository()
        const layer = await layerRepo.getActiveLayerForLocation(locId, 'ambient', 5)
        assert.ok(layer, 'Ambient layer should be persisted')
        assert.ok(layer!.value.length > 0, 'Layer content should not be empty')
        assert.strictEqual(layer?.metadata?.['authoredBy'], 'agent')
    })

    test('Ambience.Generate: accepts explicit content override in params', async () => {
        const locId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
        const action = {
            actionType: 'Ambience.Generate' as const,
            scopeKey: `loc:${locId}`,
            params: { locationId: locId, content: 'Explicit ambience text here.' }
        }

        const result = await applicator.apply(action, CORRELATION_ID, 0)

        assert.strictEqual(result.applied, true)
        const layerRepo = await fixture.getLayerRepository()
        const layer = await layerRepo.getActiveLayerForLocation(locId, 'ambient', 0)
        assert.strictEqual(layer?.value, 'Explicit ambience text here.')
    })

    // --- NPC.Dialogue ---------------------------------------------------------

    test('NPC.Dialogue: returns applied=true without writing to layer repo', async () => {
        const action = {
            actionType: 'NPC.Dialogue' as const,
            scopeKey: `loc:${LOCATION_ID}`,
            params: { npcId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', line: 'Greetings, traveller.' }
        }

        const result = await applicator.apply(action, CORRELATION_ID, 0)

        assert.strictEqual(result.applied, true)
        assert.strictEqual(result.actionType, 'NPC.Dialogue')

        // No layer should be written
        const layerRepo = await fixture.getLayerRepository()
        const layer = await layerRepo.getActiveLayerForLocation(LOCATION_ID, 'ambient', 0)
        assert.ok(!layer, 'No layer should be written for NPC.Dialogue')
    })
})

describe('pickAmbientContent', () => {
    test('returns a non-empty string', () => {
        const content = pickAmbientContent('some-location-id', 0)
        assert.ok(typeof content === 'string' && content.length > 0, 'Should return a non-empty string')
    })

    test('is deterministic for the same inputs', () => {
        const a = pickAmbientContent('location-x', 7)
        const b = pickAmbientContent('location-x', 7)
        assert.strictEqual(a, b, 'Same inputs should always produce the same content')
    })

    test('produces different results for different locationIds', () => {
        const results = new Set<string>()
        const locations = ['loc-a', 'loc-b', 'loc-c', 'loc-d', 'loc-e']
        for (const loc of locations) {
            results.add(pickAmbientContent(loc, 0))
        }
        // At least 2 distinct values from 5 different locations
        assert.ok(results.size >= 2, 'Different locations should sometimes produce different content')
    })
})
