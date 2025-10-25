import { Container } from 'inversify'
import assert from 'node:assert'
import { suite, test } from 'node:test'
import { GremlinClient } from '../../src/gremlin/gremlinClient.js'
import { setupContainer } from '../../src/inversify.config.js'

suite('testContainerRegistration', async (t) => {
    const testContainer = new Container()
    setupContainer(testContainer)
    await test('BlueskyHandler should be registered', async () => {
        assert.ok(testContainer.get(GremlinClient))
    })
})
