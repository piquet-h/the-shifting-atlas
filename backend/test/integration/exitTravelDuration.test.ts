import assert from 'node:assert'
import { afterEach, beforeEach, test } from 'node:test'
import { describeForBothModes } from '../helpers/describeForBothModes.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describeForBothModes('Exit travelDurationMs persistence', (mode) => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture(mode)
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('setExitTravelDuration round-trips via getExits', async () => {
        const locationRepo = await fixture.getLocationRepository()
        const exitRepo = await fixture.getExitRepository()

        await locationRepo.upsert({ id: 'tdur-src', name: 'Source', description: '', exits: [] })
        await locationRepo.upsert({ id: 'tdur-dst', name: 'Dest', description: '', exits: [] })
        await locationRepo.ensureExit('tdur-src', 'north', 'tdur-dst')

        const updated = await locationRepo.setExitTravelDuration('tdur-src', 'north', 300_000)
        assert.strictEqual(updated.updated, true)

        const exits = await exitRepo.getExits('tdur-src')
        const north = exits.find((e) => e.direction === 'north')
        assert.ok(north, 'north exit should exist')
        assert.strictEqual(north.travelDurationMs, 300_000)
    })

    test('setExitTravelDuration is idempotent: overwrite with new value', async () => {
        const locationRepo = await fixture.getLocationRepository()
        const exitRepo = await fixture.getExitRepository()

        await locationRepo.upsert({ id: 'tdur-idem-src', name: 'Src', description: '', exits: [] })
        await locationRepo.upsert({ id: 'tdur-idem-dst', name: 'Dst', description: '', exits: [] })
        await locationRepo.ensureExit('tdur-idem-src', 'east', 'tdur-idem-dst')

        await locationRepo.setExitTravelDuration('tdur-idem-src', 'east', 60_000)
        await locationRepo.setExitTravelDuration('tdur-idem-src', 'east', 120_000)

        const exits = await exitRepo.getExits('tdur-idem-src')
        const east = exits.find((e) => e.direction === 'east')
        assert.ok(east, 'east exit should exist')
        assert.strictEqual(east.travelDurationMs, 120_000, 'second write should overwrite the first')
    })

    test('exits without travelDurationMs have undefined value (backward compat)', async () => {
        const locationRepo = await fixture.getLocationRepository()
        const exitRepo = await fixture.getExitRepository()

        await locationRepo.upsert({ id: 'tdur-noset-src', name: 'NoSet Src', description: '', exits: [] })
        await locationRepo.upsert({ id: 'tdur-noset-dst', name: 'NoSet Dst', description: '', exits: [] })
        await locationRepo.ensureExit('tdur-noset-src', 'west', 'tdur-noset-dst')

        const exits = await exitRepo.getExits('tdur-noset-src')
        const west = exits.find((e) => e.direction === 'west')
        assert.ok(west, 'west exit should exist')
        assert.strictEqual(west.travelDurationMs, undefined, 'travelDurationMs should be absent when not set')
    })

    test('setExitTravelDuration returns updated=false for non-existent exit', async () => {
        const locationRepo = await fixture.getLocationRepository()

        await locationRepo.upsert({ id: 'tdur-missing', name: 'Missing', description: '', exits: [] })

        const result = await locationRepo.setExitTravelDuration('tdur-missing', 'south', 300_000)
        assert.strictEqual(result.updated, false)
    })

    test('setExitTravelDuration returns updated=false for invalid direction', async () => {
        const locationRepo = await fixture.getLocationRepository()

        const result = await locationRepo.setExitTravelDuration('any-loc', 'diagonal' as never, 300_000)
        assert.strictEqual(result.updated, false)
    })

    test('travelDurationMs is readable via getExits after set, multiple exits coexist', async () => {
        const locationRepo = await fixture.getLocationRepository()
        const exitRepo = await fixture.getExitRepository()

        await locationRepo.upsert({ id: 'tdur-multi-src', name: 'Multi Src', description: '', exits: [] })
        await locationRepo.upsert({ id: 'tdur-multi-n', name: 'North', description: '', exits: [] })
        await locationRepo.upsert({ id: 'tdur-multi-e', name: 'East', description: '', exits: [] })
        await locationRepo.ensureExit('tdur-multi-src', 'north', 'tdur-multi-n')
        await locationRepo.ensureExit('tdur-multi-src', 'east', 'tdur-multi-e')

        // Only set duration on north exit; east should remain undefined
        await locationRepo.setExitTravelDuration('tdur-multi-src', 'north', 300_000)

        const exits = await exitRepo.getExits('tdur-multi-src')
        const north = exits.find((e) => e.direction === 'north')
        const east = exits.find((e) => e.direction === 'east')

        assert.ok(north, 'north exit should exist')
        assert.ok(east, 'east exit should exist')
        assert.strictEqual(north.travelDurationMs, 300_000, 'north should have urban duration')
        assert.strictEqual(east.travelDurationMs, undefined, 'east should have no duration set')
    })
})
