import assert from 'node:assert/strict'
import { after, beforeEach, describe, it } from 'node:test'

import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describe('Memory mode atlas-bound seed state', () => {
    let fixture: IntegrationTestFixture

    beforeEach(() => {
        fixture = new IntegrationTestFixture('memory')
    })

    after(async () => {
        if (fixture) {
            await fixture.teardown()
        }
    })

    it('loads frontier anchors with macro atlas tags in memory mode', async () => {
        const locationRepo = await fixture.getLocationRepository()

        const northRoad = await locationRepo.get('f7c9b2ad-1e34-4c6f-8d5a-2b7e9c4f1a53')
        const northGate = await locationRepo.get('d0b2a7ea-9f4c-41d5-9b2d-7b4a0e6f1c3a')

        assert.ok(northRoad?.tags?.includes('macro:area:lr-area-mosswell-fiordhead'))
        assert.ok(northRoad?.tags?.includes('macro:route:mw-route-harbor-to-northgate'))
        assert.ok(northRoad?.tags?.includes('macro:water:fjord-sound-head'))

        assert.ok(northGate?.tags?.includes('macro:area:lr-area-mosswell-fiordhead'))
        assert.ok(northGate?.tags?.includes('macro:route:mw-route-harbor-to-northgate'))
        assert.ok(northGate?.tags?.includes('macro:water:fjord-sound-head'))
    })
})
