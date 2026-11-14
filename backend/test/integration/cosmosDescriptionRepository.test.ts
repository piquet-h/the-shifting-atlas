import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { describe, test } from 'node:test'
import { CosmosDescriptionRepository } from '../../src/repos/descriptionRepository.cosmos.js'
import { TelemetryService } from '../../src/telemetry/TelemetryService.js'
import { MockTelemetryClient } from '../mocks/MockTelemetryClient.js'
import { createMockCosmosDbSqlClient } from '../mocks/mockCosmosDbSqlClient.js'

function createTelemetryService() {
    const client = new MockTelemetryClient()
    return { client, service: new TelemetryService(client) }
}

describe('CosmosDescriptionRepository (Cosmos SQL descriptionLayers backing)', () => {
    test('persists structural_event and ambient layers into Cosmos descriptionLayers container and detects duplicates', async () => {
        const locationId = randomUUID()
        const layerId = randomUUID()
        const mockSqlClient = createMockCosmosDbSqlClient({
            descriptionLayers: {}
        })
        const { client, service } = createTelemetryService()
        const repo = new CosmosDescriptionRepository(service, mockSqlClient, 'descriptionLayers')

        const first = await repo.addLayer({
            id: layerId,
            locationId,
            type: 'structural_event',
            content: 'Charred beams litter the jetty.',
            createdAt: '2026-11-14T02:00:00.000Z',
            attributes: { changeType: 'fire', severity: 'high' }
        })
        assert.equal(first.created, true)

        // Verify persisted into Cosmos container with scopeId = loc:<locationId> and layerType = dynamic
        const container = await mockSqlClient.getContainer('descriptionLayers')
        const { resources } = await container.items.query('SELECT * FROM c').fetchNext()
        assert.equal(resources.length, 1)
        const stored = resources[0] as unknown as Record<string, unknown>
        assert.equal(stored.scopeId, `loc:${locationId}`)
        assert.equal(stored.layerType, 'dynamic')
        assert.equal(stored.value, 'Charred beams litter the jetty.')

        // Duplicate ID returns created=false without overwriting
        const second = await repo.addLayer({
            id: layerId,
            locationId,
            type: 'structural_event',
            content: 'Charred beams litter the jetty.',
            createdAt: '2026-11-14T02:00:00.000Z'
        })
        assert.equal(second.created, false)

        const fetched = await repo.getLayersForLocation(locationId)
        assert.equal(fetched.length, 1)
        assert.equal(fetched[0].type, 'structural_event')
        assert.equal(fetched[0].attributes?.changeType, 'fire')
        assert.ok(client.events.some((e) => e.name === 'Description.Cache.Hit'))
    })

    test('getAllLayers and updateIntegrityHash operate on layers authored via ILayerRepository in descriptionLayers', async () => {
        const locationId = randomUUID()
        const agentLayerId = randomUUID()
        const mockSqlClient = createMockCosmosDbSqlClient({
            descriptionLayers: {
                [agentLayerId]: {
                    id: agentLayerId,
                    scopeId: `loc:${locationId}`,
                    layerType: 'ambient',
                    value: 'Mist curls around the lanterns.',
                    effectiveFromTick: 0,
                    effectiveToTick: null,
                    authoredAt: '2026-11-14T03:00:00.000Z',
                    metadata: { authoredBy: 'agent' }
                }
            }
        })
        const { service } = createTelemetryService()
        const repo = new CosmosDescriptionRepository(service, mockSqlClient, 'descriptionLayers')

        const all = await repo.getAllLayers()
        assert.equal(all.length, 1)
        assert.equal(all[0].id, agentLayerId)
        assert.equal(all[0].locationId, locationId)
        assert.equal(all[0].content, 'Mist curls around the lanterns.')

        const updateRes = await repo.updateIntegrityHash(agentLayerId, 'a'.repeat(64))
        assert.equal(updateRes.updated, true)

        const afterHash = await repo.getAllLayers()
        assert.equal(afterHash[0].integrityHash, 'a'.repeat(64))
    })
})
