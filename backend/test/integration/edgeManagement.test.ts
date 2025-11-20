import { getOppositeDirection } from '@piquet-h/shared'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { describeForBothModes } from '../helpers/describeForBothModes.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describeForBothModes('Edge Management', (mode) => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture(mode)
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('ensureExit - creates new exit and returns created=true', async () => {
        const repo = await fixture.getLocationRepository()

        // Create locations first
        await repo.upsert({ id: 'A', name: 'Location A', description: 'First', exits: [] })
        await repo.upsert({ id: 'B', name: 'Location B', description: 'Second', exits: [] })

        const result = await repo.ensureExit('A', 'north', 'B')
        assert.strictEqual(result.created, true)
    })

    test('ensureExit - idempotent when exit already exists', async () => {
        const repo = await fixture.getLocationRepository()

        // Create locations and exit
        await repo.upsert({ id: 'A', name: 'Location A', description: 'First', exits: [] })
        await repo.upsert({ id: 'B', name: 'Location B', description: 'Second', exits: [] })
        await repo.ensureExit('A', 'north', 'B')

        const result = await repo.ensureExit('A', 'north', 'B')
        assert.strictEqual(result.created, false)
    })

    test('ensureExitBidirectional - creates forward exit only when reciprocal=false', async () => {
        const repo = await fixture.getLocationRepository()

        await repo.upsert({ id: 'A', name: 'Location A', description: 'First', exits: [] })
        await repo.upsert({ id: 'B', name: 'Location B', description: 'Second', exits: [] })

        const result = await repo.ensureExitBidirectional('A', 'north', 'B', { reciprocal: false })
        assert.strictEqual(result.created, true)
        assert.strictEqual(result.reciprocalCreated, undefined)
    })

    test('ensureExitBidirectional - creates both exits when reciprocal=true', async () => {
        const repo = await fixture.getLocationRepository()

        await repo.upsert({ id: 'A', name: 'Location A', description: 'First', exits: [] })
        await repo.upsert({ id: 'B', name: 'Location B', description: 'Second', exits: [] })

        const result = await repo.ensureExitBidirectional('A', 'north', 'B', { reciprocal: true })
        assert.strictEqual(result.created, true)
        assert.strictEqual(result.reciprocalCreated, true)
    })

    test('ensureExitBidirectional - idempotent when both exits exist', async () => {
        const repo = await fixture.getLocationRepository()

        await repo.upsert({ id: 'A', name: 'Location A', description: 'First', exits: [] })
        await repo.upsert({ id: 'B', name: 'Location B', description: 'Second', exits: [] })
        await repo.ensureExitBidirectional('A', 'north', 'B', { reciprocal: true })

        const result = await repo.ensureExitBidirectional('A', 'north', 'B', { reciprocal: true })
        assert.strictEqual(result.created, false)
        assert.strictEqual(result.reciprocalCreated, false)
    })

    test('ensureExitBidirectional - creates only missing reciprocal when forward exists', async () => {
        const repo = await fixture.getLocationRepository()

        await repo.upsert({ id: 'A', name: 'Location A', description: 'First', exits: [] })
        await repo.upsert({ id: 'B', name: 'Location B', description: 'Second', exits: [] })
        await repo.ensureExit('A', 'north', 'B')

        const result = await repo.ensureExitBidirectional('A', 'north', 'B', { reciprocal: true })
        assert.strictEqual(result.created, false)
        assert.strictEqual(result.reciprocalCreated, true)
    })

    test('removeExit - removes existing exit and returns removed=true', async () => {
        const repo = await fixture.getLocationRepository()

        await repo.upsert({ id: 'A', name: 'Location A', description: 'First', exits: [] })
        await repo.upsert({ id: 'B', name: 'Location B', description: 'Second', exits: [] })
        await repo.ensureExit('A', 'north', 'B')

        const result = await repo.removeExit('A', 'north')
        assert.strictEqual(result.removed, true)
    })

    test('removeExit - returns removed=false when exit does not exist', async () => {
        const repo = await fixture.getLocationRepository()

        await repo.upsert({ id: 'A', name: 'Location A', description: 'First', exits: [] })

        const result = await repo.removeExit('A', 'north')
        assert.strictEqual(result.removed, false)
    })

    test('removeExit - returns removed=false for invalid direction', async () => {
        const repo = await fixture.getLocationRepository()

        await repo.upsert({ id: 'A', name: 'Location A', description: 'First', exits: [] })

        const result = await repo.removeExit('A', 'invalid-direction')
        assert.strictEqual(result.removed, false)
    })

    test('applyExits - batch creates multiple exits with metrics', async () => {
        const repo = await fixture.getLocationRepository()

        await repo.upsert({ id: 'A', name: 'Location A', description: 'First', exits: [] })
        await repo.upsert({ id: 'B', name: 'Location B', description: 'Second', exits: [] })
        await repo.upsert({ id: 'C', name: 'Location C', description: 'Third', exits: [] })

        const result = await repo.applyExits([
            { fromId: 'A', direction: 'north', toId: 'B', reciprocal: false },
            { fromId: 'B', direction: 'east', toId: 'C', reciprocal: false },
            { fromId: 'C', direction: 'south', toId: 'A', reciprocal: false }
        ])

        assert.strictEqual(result.exitsCreated, 3)
        assert.strictEqual(result.exitsSkipped, 0)
        assert.strictEqual(result.reciprocalApplied, 0)
    })

    test('applyExits - batch with reciprocal exits', async () => {
        const repo = await fixture.getLocationRepository()

        await repo.upsert({ id: 'A', name: 'Location A', description: 'First', exits: [] })
        await repo.upsert({ id: 'B', name: 'Location B', description: 'Second', exits: [] })
        await repo.upsert({ id: 'C', name: 'Location C', description: 'Third', exits: [] })

        const result = await repo.applyExits([
            { fromId: 'A', direction: 'north', toId: 'B', reciprocal: true },
            { fromId: 'C', direction: 'west', toId: 'A', reciprocal: true }
        ])

        assert.strictEqual(result.exitsCreated, 2)
        assert.strictEqual(result.exitsSkipped, 0)
        assert.strictEqual(result.reciprocalApplied, 2)
    })

    test('applyExits - batch with mix of new and existing exits', async () => {
        const repo = await fixture.getLocationRepository()

        await repo.upsert({ id: 'A', name: 'Location A', description: 'First', exits: [] })
        await repo.upsert({ id: 'B', name: 'Location B', description: 'Second', exits: [] })
        await repo.upsert({ id: 'C', name: 'Location C', description: 'Third', exits: [] })
        await repo.ensureExit('A', 'north', 'B')

        const result = await repo.applyExits([
            { fromId: 'A', direction: 'north', toId: 'B', reciprocal: false }, // Exists
            { fromId: 'B', direction: 'east', toId: 'C', reciprocal: false } // New
        ])

        assert.strictEqual(result.exitsCreated, 1)
        assert.strictEqual(result.exitsSkipped, 1)
        assert.strictEqual(result.reciprocalApplied, 0)
    })

    test('applyExits - empty array returns zero metrics', async () => {
        const repo = await fixture.getLocationRepository()

        const result = await repo.applyExits([])

        assert.strictEqual(result.exitsCreated, 0)
        assert.strictEqual(result.exitsSkipped, 0)
        assert.strictEqual(result.reciprocalApplied, 0)
    })

    test('location version policy - version unchanged when only exits added', async () => {
        const repo = await fixture.getLocationRepository()

        // Create location with initial version (ignore result; only version read separately)
        await repo.upsert({ id: 'A', name: 'Alpha', description: 'First location', exits: [] })
        const initialLocation = await repo.get('A')
        const initialVersion = initialLocation?.version || 1

        // Add exit (structural change only)
        await repo.upsert({ id: 'B', name: 'Beta', description: 'Second', exits: [] })
        await repo.ensureExit('A', 'north', 'B')

        // Verify version unchanged
        const location = await repo.get('A')
        assert.ok(location)
        assert.strictEqual(location.version, initialVersion)
    })

    test('location version policy - version unchanged when exit removed', async () => {
        const repo = await fixture.getLocationRepository()

        // Create locations and exit
        await repo.upsert({ id: 'A', name: 'Alpha', description: 'First location', exits: [] })
        await repo.upsert({ id: 'B', name: 'Beta', description: 'Second', exits: [] })
        await repo.ensureExit('A', 'north', 'B')

        const beforeRemoval = await repo.get('A')
        const versionBeforeRemoval = beforeRemoval?.version || 1

        // Remove exit (structural change only)
        await repo.removeExit('A', 'north')

        // Verify version unchanged
        const location = await repo.get('A')
        assert.ok(location)
        assert.strictEqual(location.version, versionBeforeRemoval)
    })
})

// Pure logic tests for getOppositeDirection (unit-appropriate)
describe('getOppositeDirection', () => {
    test('cardinal directions', () => {
        assert.strictEqual(getOppositeDirection('north'), 'south')
        assert.strictEqual(getOppositeDirection('south'), 'north')
        assert.strictEqual(getOppositeDirection('east'), 'west')
        assert.strictEqual(getOppositeDirection('west'), 'east')
    })

    test('diagonal directions', () => {
        assert.strictEqual(getOppositeDirection('northeast'), 'southwest')
        assert.strictEqual(getOppositeDirection('southwest'), 'northeast')
        assert.strictEqual(getOppositeDirection('northwest'), 'southeast')
        assert.strictEqual(getOppositeDirection('southeast'), 'northwest')
    })

    test('vertical and portal directions', () => {
        assert.strictEqual(getOppositeDirection('up'), 'down')
        assert.strictEqual(getOppositeDirection('down'), 'up')
        assert.strictEqual(getOppositeDirection('in'), 'out')
        assert.strictEqual(getOppositeDirection('out'), 'in')
    })
})
