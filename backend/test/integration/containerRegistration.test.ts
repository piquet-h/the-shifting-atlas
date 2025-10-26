import { Container } from 'inversify'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { setupContainer } from '../../src/inversify.config.js'
import { ILocationRepository } from '../../src/repos/locationRepository.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describe('Container Registration', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('ILocationRepository should be registered', async () => {
        const container = await fixture.getContainer()
        const repo = container.get<ILocationRepository>('ILocationRepository')
        assert.ok(repo, 'LocationRepository should be available')
    })
})
