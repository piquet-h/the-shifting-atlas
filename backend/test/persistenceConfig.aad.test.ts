import assert from 'node:assert'
import process from 'node:process'
import { beforeEach, describe, test } from 'node:test'
import { loadPersistenceConfigAsync } from '../src/persistenceConfig.js'

/**
 * Verifies that Gremlin configuration always uses AAD (Managed Identity) and never requires a key.
 */
describe('persistenceConfig Gremlin AAD auth (keyless)', () => {
    const prev = { ...process.env }
    beforeEach(() => {
        // reset env to baseline for each test
        process.env = { ...prev }
        process.env.PERSISTENCE_MODE = 'cosmos'
        process.env.COSMOS_GREMLIN_ENDPOINT = 'wss://example.gremlin.cosmos.azure.com:443/'
        process.env.COSMOS_GREMLIN_DATABASE = 'game'
        process.env.COSMOS_GREMLIN_GRAPH = 'world'
        process.env.COSMOS_SQL_ENDPOINT = 'https://example.documents.azure.com:443/'
        process.env.COSMOS_SQL_DATABASE = 'game'
        process.env.COSMOS_SQL_CONTAINER_PLAYERS = 'players'
        process.env.COSMOS_SQL_CONTAINER_INVENTORY = 'inventory'
        process.env.COSMOS_SQL_CONTAINER_LAYERS = 'descriptionLayers'
        process.env.COSMOS_SQL_CONTAINER_EVENTS = 'worldEvents'
    })

    test('returns config with no key property', async () => {
        const cfg = await loadPersistenceConfigAsync()
        assert.strictEqual(cfg.mode, 'cosmos')
        assert.ok(cfg.cosmos)
        // @ts-expect-error authMode removed
        assert.strictEqual(cfg.cosmos?.authMode, undefined)
        // @ts-expect-error key removed
        assert.strictEqual(cfg.cosmos?.key, undefined)
    })
})
