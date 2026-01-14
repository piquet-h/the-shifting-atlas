import { strict as assert } from 'assert'
import { Container } from 'inversify'
import { describe, it } from 'node:test'
import { SimplePingHandler } from '../../src/handlers/pingSimple.js'
import { setupTestContainer } from '../helpers/testInversify.config.js'

describe('DI binding scopes', () => {
    it('handlers are transient (not singleton) in the test container', async () => {
        const container = new Container()
        await setupTestContainer(container, 'mock')

        const first = container.get(SimplePingHandler)
        const second = container.get(SimplePingHandler)

        // We want tests to mirror production behavior: handlers should not be singletons.
        assert.notStrictEqual(first, second)
    })
})
