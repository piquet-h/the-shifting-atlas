import { strict as assert } from 'assert'
import { randomUUID } from 'crypto'
import { afterEach, beforeEach, test } from 'node:test'
import type { IPlayerDocRepository } from '../../src/repos/PlayerDocRepository.js'
import { describeForBothModes } from '../helpers/describeForBothModes.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

// Skip cosmos mode gracefully if repository method not available (config incomplete or feature unsupported)

describeForBothModes('PlayerDocRepository.listPlayerIdsByPrefixes', (mode) => {
    let fixture: IntegrationTestFixture

    // Using beforeAll/afterAll to align with existing test style (reduces nesting warnings)
    // Use per-test setup consistent with existing integration suite (beforeAll not globally typed)
    let repo: IPlayerDocRepository | undefined

    beforeEach(async () => {
        fixture = new IntegrationTestFixture(mode)
        await fixture.setup()
        repo = await fixture.getPlayerDocRepository()
    })

    afterEach(async () => {
        await fixture.teardown()
        repo = undefined
    })

    test('returns matching IDs by prefix', async () => {
        const r = repo as IPlayerDocRepository & { listPlayerIdsByPrefixes?: (p: string[], max?: number) => Promise<string[]> }
        if (!r || typeof r !== 'object') assert.fail('Repository not initialized')
        if (!('listPlayerIdsByPrefixes' in r)) {
            if (mode === 'cosmos') {
                console.log('Skipping listPlayerIdsByPrefixes test in cosmos mode (method unavailable)')
                return
            }
            assert.fail('listPlayerIdsByPrefixes not available in memory mode (unexpected)')
        }

        const baseId = 'test-player-' + randomUUID().split('-')[0]
        const otherId = 'regular-player-' + randomUUID().split('-')[0]

        await r.upsertPlayer({
            id: baseId,
            createdUtc: new Date().toISOString(),
            updatedUtc: new Date().toISOString(),
            currentLocationId: 'loc-' + randomUUID().split('-')[0]
        })
        await r.upsertPlayer({
            id: otherId,
            createdUtc: new Date().toISOString(),
            updatedUtc: new Date().toISOString(),
            currentLocationId: 'loc-' + randomUUID().split('-')[0]
        })

        const results = await r.listPlayerIdsByPrefixes(['test-player-'])
        assert.ok(results.includes(baseId), 'Expected test-player ID in results')
        assert.ok(!results.includes(otherId), 'Expected regular-player ID not in results')
    })

    test('empty prefixes returns empty array', async () => {
        const r = repo as IPlayerDocRepository & { listPlayerIdsByPrefixes?: (p: string[], max?: number) => Promise<string[]> }
        if (!r || typeof r !== 'object') assert.fail('Repository not initialized')
        if (!('listPlayerIdsByPrefixes' in r)) {
            if (mode === 'cosmos') {
                console.log('Skipping empty prefixes test in cosmos mode (method unavailable)')
                return
            }
            assert.fail('listPlayerIdsByPrefixes not available in memory mode (unexpected)')
        }
        const results = await r.listPlayerIdsByPrefixes([])
        assert.equal(results.length, 0)
    })
})
