import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { loadPersistenceConfigAsync } from '../../src/persistenceConfig.js'

describe('Gremlin Config Precedence', () => {
    const ORIGINAL_ENV = { ...process.env }

    beforeEach(() => {
        // Reset env each test
        process.env = { ...ORIGINAL_ENV }
    })

    afterEach(() => {
        // Restore baseline after each test to avoid leaking settings
        process.env = { ...ORIGINAL_ENV }
    })

    test('prefers COSMOS_GREMLIN_* variables over legacy GREMLIN_*', async () => {
        process.env.PERSISTENCE_MODE = 'cosmos'
        process.env.COSMOS_GREMLIN_ENDPOINT = 'https://acct.documents.azure.com'
        process.env.COSMOS_GREMLIN_DATABASE = 'game'
        process.env.COSMOS_GREMLIN_GRAPH = 'world'
        // Legacy vars set differently to verify precedence
        process.env.GREMLIN_ENDPOINT = 'https://legacy.should.not.use'
        process.env.GREMLIN_DATABASE = 'legacyDb'
        process.env.GREMLIN_GRAPH = 'legacyGraph'

        // Test the config loading function directly (not container binding)
        const config = await loadPersistenceConfigAsync()

        assert.strictEqual(config.mode, 'cosmos')
        assert.ok(config.cosmos, 'should have cosmos config')
        assert.strictEqual(config.cosmos!.endpoint, 'https://acct.documents.azure.com')
        assert.strictEqual(config.cosmos!.database, 'game')
        assert.strictEqual(config.cosmos!.graph, 'world')
    })

    test('falls back to legacy GREMLIN_* when COSMOS_GREMLIN_* unset', async () => {
        process.env.PERSISTENCE_MODE = 'cosmos'
        process.env.GREMLIN_ENDPOINT = 'https://legacy.documents.azure.com'
        process.env.GREMLIN_DATABASE = 'game'
        process.env.GREMLIN_GRAPH = 'world'

        // Test the config loading function directly (not container binding)
        const config = await loadPersistenceConfigAsync()

        assert.strictEqual(config.mode, 'cosmos')
        assert.ok(config.cosmos, 'should have cosmos config')
        assert.strictEqual(config.cosmos!.endpoint, 'https://legacy.documents.azure.com')
        assert.strictEqual(config.cosmos!.database, 'game')
        assert.strictEqual(config.cosmos!.graph, 'world')
    })

    test('COSMOS_ENDPOINT is accepted as fallback for COSMOS_GREMLIN_ENDPOINT', async () => {
        process.env.PERSISTENCE_MODE = 'cosmos'
        process.env.COSMOS_ENDPOINT = 'https://cosmos-endpoint.documents.azure.com'
        process.env.COSMOS_GREMLIN_DATABASE = 'game'
        process.env.COSMOS_GREMLIN_GRAPH = 'world'

        const config = await loadPersistenceConfigAsync()

        assert.strictEqual(config.mode, 'cosmos')
        assert.ok(config.cosmos, 'should have cosmos config')
        assert.strictEqual(config.cosmos!.endpoint, 'https://cosmos-endpoint.documents.azure.com')
    })
})
