import { Container } from 'inversify'
import assert from 'node:assert'
import { suite, test } from 'node:test'
import { setupContainer } from '../../src/inversify.config.js'
import { ILocationRepository } from '../../src/repos/locationRepository.js'

suite('testContainerRegistration', async () => {
    const testContainer = new Container()
    await setupContainer(testContainer)

    await test('ILocationRepository should be registered', async () => {
        const repo = testContainer.get<ILocationRepository>('ILocationRepository')
        assert.ok(repo, 'LocationRepository should be available')
    })
})
