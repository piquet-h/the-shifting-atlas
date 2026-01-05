import assert from 'node:assert'
import process from 'node:process'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { loadPersistenceConfigAsync } from '../../src/persistenceConfig.js'

/**
 * Tests for PERSISTENCE_STRICT mode behavior.
 * Verifies that when strict mode is enabled, missing configuration throws errors
 * instead of silently falling back to memory mode.
 */
describe('persistenceConfig strict mode', () => {
    const originalEnv = { ...process.env }

    beforeEach(() => {
        // Reset to baseline for each test
        process.env = { ...originalEnv }
    })

    afterEach(() => {
        // Restore original environment
        process.env = originalEnv
    })

    test('strict mode disabled: falls back to memory when config incomplete', async () => {
        process.env.PERSISTENCE_MODE = 'cosmos'
        process.env.PERSISTENCE_STRICT = '0'
        // Intentionally omit COSMOS_GREMLIN_ENDPOINT
        process.env.COSMOS_GREMLIN_DATABASE = 'game'
        process.env.COSMOS_GREMLIN_GRAPH = 'world'

        const cfg = await loadPersistenceConfigAsync()
        assert.strictEqual(cfg.mode, 'memory', 'Should fall back to memory mode when config incomplete and strict disabled')
    })

    test('strict mode enabled: throws error when Gremlin config incomplete (missing endpoint)', async () => {
        process.env.PERSISTENCE_MODE = 'cosmos'
        process.env.PERSISTENCE_STRICT = '1'
        // Intentionally omit COSMOS_GREMLIN_ENDPOINT
        process.env.COSMOS_GREMLIN_DATABASE = 'game'
        process.env.COSMOS_GREMLIN_GRAPH = 'world'

        await assert.rejects(
            async () => await loadPersistenceConfigAsync(),
            {
                message: /PERSISTENCE_STRICT enabled but Cosmos Gremlin configuration incomplete.*COSMOS_GREMLIN_ENDPOINT/
            },
            'Should throw error when endpoint missing in strict mode'
        )
    })

    test('strict mode enabled: throws error when Gremlin config incomplete (missing database)', async () => {
        process.env.PERSISTENCE_MODE = 'cosmos'
        process.env.PERSISTENCE_STRICT = '1'
        process.env.COSMOS_GREMLIN_ENDPOINT = 'wss://example.gremlin.cosmos.azure.com:443/'
        // Intentionally omit COSMOS_GREMLIN_DATABASE
        process.env.COSMOS_GREMLIN_GRAPH = 'world'

        await assert.rejects(
            async () => await loadPersistenceConfigAsync(),
            {
                message: /PERSISTENCE_STRICT enabled but Cosmos Gremlin configuration incomplete.*COSMOS_GREMLIN_DATABASE/
            },
            'Should throw error when database missing in strict mode'
        )
    })

    test('strict mode enabled: throws error when Gremlin config incomplete (missing graph)', async () => {
        process.env.PERSISTENCE_MODE = 'cosmos'
        process.env.PERSISTENCE_STRICT = '1'
        process.env.COSMOS_GREMLIN_ENDPOINT = 'wss://example.gremlin.cosmos.azure.com:443/'
        process.env.COSMOS_GREMLIN_DATABASE = 'game'
        // Intentionally omit COSMOS_GREMLIN_GRAPH

        await assert.rejects(
            async () => await loadPersistenceConfigAsync(),
            {
                message: /PERSISTENCE_STRICT enabled but Cosmos Gremlin configuration incomplete.*COSMOS_GREMLIN_GRAPH/
            },
            'Should throw error when graph missing in strict mode'
        )
    })

    test('strict mode enabled: throws error when SQL API config incomplete', async () => {
        process.env.PERSISTENCE_MODE = 'cosmos'
        process.env.PERSISTENCE_STRICT = '1'
        // Complete Gremlin config
        process.env.COSMOS_GREMLIN_ENDPOINT = 'wss://example.gremlin.cosmos.azure.com:443/'
        process.env.COSMOS_GREMLIN_DATABASE = 'game'
        process.env.COSMOS_GREMLIN_GRAPH = 'world'
        // Incomplete SQL API config - omit some containers
        process.env.COSMOS_SQL_ENDPOINT = 'https://example.documents.azure.com:443/'
        process.env.COSMOS_SQL_DATABASE = 'game'
        process.env.COSMOS_SQL_CONTAINER_PLAYERS = 'players'
        // Intentionally omit COSMOS_SQL_CONTAINER_INVENTORY

        await assert.rejects(
            async () => await loadPersistenceConfigAsync(),
            {
                message: /PERSISTENCE_STRICT enabled but Cosmos SQL API configuration incomplete.*COSMOS_SQL_CONTAINER_INVENTORY/
            },
            'Should throw error when SQL API config incomplete in strict mode'
        )
    })

    test('strict mode enabled: throws error when COSMOS_SQL_CONTAINER_LAYERS missing', async () => {
        process.env.PERSISTENCE_MODE = 'cosmos'
        process.env.PERSISTENCE_STRICT = '1'
        // Complete Gremlin config
        process.env.COSMOS_GREMLIN_ENDPOINT = 'wss://example.gremlin.cosmos.azure.com:443/'
        process.env.COSMOS_GREMLIN_DATABASE = 'game'
        process.env.COSMOS_GREMLIN_GRAPH = 'world'
        // Incomplete SQL API config - omit LAYERS container
        process.env.COSMOS_SQL_ENDPOINT = 'https://example.documents.azure.com:443/'
        process.env.COSMOS_SQL_DATABASE = 'game'
        process.env.COSMOS_SQL_CONTAINER_PLAYERS = 'players'
        process.env.COSMOS_SQL_CONTAINER_INVENTORY = 'inventory'
        // Intentionally omit COSMOS_SQL_CONTAINER_LAYERS
        process.env.COSMOS_SQL_CONTAINER_EVENTS = 'worldEvents'

        await assert.rejects(
            async () => await loadPersistenceConfigAsync(),
            {
                message: /PERSISTENCE_STRICT enabled but Cosmos SQL API configuration incomplete.*COSMOS_SQL_CONTAINER_LAYERS/
            },
            'Should throw error when COSMOS_SQL_CONTAINER_LAYERS missing in strict mode'
        )
    })

    test('strict mode enabled: throws error when COSMOS_SQL_CONTAINER_EVENTS missing', async () => {
        process.env.PERSISTENCE_MODE = 'cosmos'
        process.env.PERSISTENCE_STRICT = '1'
        // Complete Gremlin config
        process.env.COSMOS_GREMLIN_ENDPOINT = 'wss://example.gremlin.cosmos.azure.com:443/'
        process.env.COSMOS_GREMLIN_DATABASE = 'game'
        process.env.COSMOS_GREMLIN_GRAPH = 'world'
        // Incomplete SQL API config - omit EVENTS container
        process.env.COSMOS_SQL_ENDPOINT = 'https://example.documents.azure.com:443/'
        process.env.COSMOS_SQL_DATABASE = 'game'
        process.env.COSMOS_SQL_CONTAINER_PLAYERS = 'players'
        process.env.COSMOS_SQL_CONTAINER_INVENTORY = 'inventory'
        process.env.COSMOS_SQL_CONTAINER_LAYERS = 'descriptionLayers'
        // Intentionally omit COSMOS_SQL_CONTAINER_EVENTS

        await assert.rejects(
            async () => await loadPersistenceConfigAsync(),
            {
                message: /PERSISTENCE_STRICT enabled but Cosmos SQL API configuration incomplete.*COSMOS_SQL_CONTAINER_EVENTS/
            },
            'Should throw error when COSMOS_SQL_CONTAINER_EVENTS missing in strict mode'
        )
    })

    test('strict mode enabled with string "true": throws error when config incomplete', async () => {
        process.env.PERSISTENCE_MODE = 'cosmos'
        process.env.PERSISTENCE_STRICT = 'true'
        // Intentionally omit COSMOS_GREMLIN_ENDPOINT

        await assert.rejects(
            async () => await loadPersistenceConfigAsync(),
            {
                message: /PERSISTENCE_STRICT enabled but Cosmos Gremlin configuration incomplete/
            },
            'Should recognize "true" string as strict mode enabled'
        )
    })

    test('strict mode enabled: succeeds with complete config', async () => {
        process.env.PERSISTENCE_MODE = 'cosmos'
        process.env.PERSISTENCE_STRICT = '1'
        // Complete Gremlin config
        process.env.COSMOS_GREMLIN_ENDPOINT = 'wss://example.gremlin.cosmos.azure.com:443/'
        process.env.COSMOS_GREMLIN_DATABASE = 'game'
        process.env.COSMOS_GREMLIN_GRAPH = 'world'
        // Complete SQL API config
        process.env.COSMOS_SQL_ENDPOINT = 'https://example.documents.azure.com:443/'
        process.env.COSMOS_SQL_DATABASE = 'game'
        process.env.COSMOS_SQL_CONTAINER_PLAYERS = 'players'
        process.env.COSMOS_SQL_CONTAINER_INVENTORY = 'inventory'
        process.env.COSMOS_SQL_CONTAINER_LAYERS = 'descriptionLayers'
        process.env.COSMOS_SQL_CONTAINER_EVENTS = 'worldEvents'

        const cfg = await loadPersistenceConfigAsync()
        assert.strictEqual(cfg.mode, 'cosmos', 'Should use cosmos mode with complete config')
        assert.ok(cfg.cosmos, 'Should have cosmos config')
        assert.ok(cfg.cosmosSql, 'Should have cosmosSql config')
        assert.strictEqual(cfg.cosmos?.endpoint, 'wss://example.gremlin.cosmos.azure.com:443/')
        assert.strictEqual(cfg.cosmosSql?.endpoint, 'https://example.documents.azure.com:443/')
    })

    test('memory mode: strict flag has no effect', async () => {
        process.env.PERSISTENCE_MODE = 'memory'
        process.env.PERSISTENCE_STRICT = '1'
        // No cosmos config needed for memory mode

        const cfg = await loadPersistenceConfigAsync()
        assert.strictEqual(cfg.mode, 'memory', 'Should use memory mode')
    })
})
