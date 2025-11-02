import { Container } from 'inversify'
import assert from 'node:assert'
import { beforeEach, describe, test } from 'node:test'
import { GremlinClientConfig } from '../../src/gremlin/gremlinClient.js'
import { setupContainer } from '../../src/inversify.config.js'

describe('GremlinConfig Binding', () => {
    const ORIGINAL_ENV = { ...process.env }

    beforeEach(() => {
        // Reset env each test
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

        const c = new Container()
        await setupContainer(c)
        const cfg = c.get<GremlinClientConfig>('GremlinConfig')
        assert.equal(cfg.endpoint, 'https://acct.documents.azure.com')
        assert.equal(cfg.database, 'game')
        assert.equal(cfg.graph, 'world')
    })

    test('falls back to legacy GREMLIN_* when COSMOS_GREMLIN_* unset', async () => {
        process.env.PERSISTENCE_MODE = 'cosmos'
        process.env.GREMLIN_ENDPOINT = 'https://legacy.documents.azure.com'
        process.env.GREMLIN_DATABASE = 'game'
        process.env.GREMLIN_GRAPH = 'world'

        const c = new Container()
        await setupContainer(c)
        const cfg = c.get<GremlinClientConfig>('GremlinConfig')
        assert.equal(cfg.endpoint, 'https://legacy.documents.azure.com')
        assert.equal(cfg.database, 'game')
        assert.equal(cfg.graph, 'world')
    })
})
