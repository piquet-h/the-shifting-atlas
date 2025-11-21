import { strict as assert } from 'assert'
import { randomUUID } from 'crypto'
import { afterEach, beforeEach, test } from 'node:test'
import { describeForBothModes } from '../helpers/describeForBothModes.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describeForBothModes('PlayerDocRepository.deletePlayer', (mode) => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture(mode)
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('deletes existing player document (idempotent)', async () => {
        const repo = await fixture.getPlayerDocRepository()
        const playerId = randomUUID()
        await repo.upsertPlayer({
            id: playerId,
            createdUtc: new Date().toISOString(),
            updatedUtc: new Date().toISOString(),
            currentLocationId: 'loc-' + randomUUID().split('-')[0]
        })

        const first = await repo.deletePlayer(playerId)
        const second = await repo.deletePlayer(playerId) // idempotent

        assert.equal(first, true, 'First delete should return true')
        assert.equal(second, false, 'Second delete should return false (already gone)')
        const fetched = await repo.getPlayer(playerId)
        assert.equal(fetched, null, 'Player should be absent after delete')
    })

    test('deletePlayer returns false for unknown id', async () => {
        const repo = await fixture.getPlayerDocRepository()
        const playerId = randomUUID()
        const result = await repo.deletePlayer(playerId)
        assert.equal(result, false, 'Deleting non-existent player returns false')
    })
})
