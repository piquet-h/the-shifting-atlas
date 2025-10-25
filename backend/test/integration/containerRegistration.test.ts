import { suite, test } from 'node:test'
import assert from 'node:assert'
import { setupContainer } from '../../src/inversify.config.js'
import { Container } from 'inversify'
import { GremlinClient } from '../../src/gremlin/gremlinClient.js'

suite('testContainerRegistration', async (t) => {
    const testContainer = new Container()
    setupContainer(testContainer)
    await test('BlueskyHandler should be registered', async () => {
        assert.ok(testContainer.get(GremlinClient))
    })
})
