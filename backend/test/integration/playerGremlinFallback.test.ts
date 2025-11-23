/**
 * Player Repository SQL-only Mode Integration Tests (post ADR-004)
 *
 * Confirms removal of DISABLE_GREMLIN_PLAYER_VERTEX flag and Gremlin fallback logic.
 * Ensures basic player lifecycle operates solely against SQL repository bindings.
 */
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describe('Player Repository SQL-only Mode (post ADR-004)', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('featureFlags module no longer exports DISABLE_GREMLIN_PLAYER_VERTEX', async () => {
        const featureFlagsModule = await import('../../src/config/featureFlags.js')
        assert.ok(!('DISABLE_GREMLIN_PLAYER_VERTEX' in featureFlagsModule), 'Legacy feature flag constant should be removed')
        const snapshot = featureFlagsModule.getFeatureFlagSnapshot()
        assert.strictEqual(Object.keys(snapshot).length, 0, 'Snapshot should be empty in SQL-only mode')
    })

    test('getOrCreate + get lifecycle succeeds without fallback', async () => {
        const playerRepo = await fixture.getPlayerRepository()
        const { record, created } = await playerRepo.getOrCreate()
        assert.ok(created, 'Player should be created')
        assert.ok(record.id, 'Player should have an ID')
        const retrieved = await playerRepo.get(record.id)
        assert.ok(retrieved, 'Player should be retrievable from SQL')
        assert.strictEqual(retrieved.id, record.id)
    })

    test('get returns undefined for non-existent player ID', async () => {
        const playerRepo = await fixture.getPlayerRepository()
        const missing = await playerRepo.get('ffffffff-ffff-4fff-8fff-ffffffffffff')
        assert.strictEqual(missing, undefined)
    })
})
