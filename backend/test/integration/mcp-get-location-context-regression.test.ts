/**
 * Regression test for get-location-context MCP tool error
 * Issue: Endpoint returns "An error occurred invoking 'get-location-context'"
 *
 * Test-Driven Development approach:
 * 1. RED: Write failing test that reproduces the production error
 * 2. GREEN: Fix the implementation
 * 3. REFACTOR: Clean up if needed
 */

import type { InvocationContext } from '@azure/functions'
import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describe('MCP get-location-context regression (TDD)', () => {
    it('should return valid JSON without throwing when called with no arguments', async () => {
        // ARRANGE: Set up test container with all dependencies
        const fixture = new IntegrationTestFixture()
        await fixture.setup()

        const container = await fixture.getContainer()
        const { WorldContextHandler } = await import('../../src/handlers/mcp/world-context/world-context.js')
        const handler = container.get(WorldContextHandler)

        // ACT: Call getLocationContext with empty arguments (like MCP tool does)
        const toolArguments = { arguments: {} }
        const mockContext = { invocationId: 'test-invocation' } as Partial<InvocationContext>

        let result = ''
        let error: Error | null = null

        try {
            result = await handler.getLocationContext(toolArguments, mockContext as InvocationContext)
        } catch (err) {
            error = err as Error
        }

        await fixture.teardown()

        // ASSERT: Should not throw an error
        assert.equal(error, null, `Expected no error, but got: ${error?.message}`)

        // ASSERT: Result should be valid JSON
        let parsed: unknown
        try {
            parsed = JSON.parse(result)
        } catch {
            assert.fail(`Result is not valid JSON: ${result}`)
        }

        // ASSERT: Response should have expected structure
        assert.ok(parsed, 'Parsed result should exist')
        assert.ok(typeof parsed === 'object' && parsed !== null, 'Parsed result should be an object')
        const parsedObj = parsed as Record<string, unknown>
        assert.ok('tick' in parsedObj, 'Result should include tick')
        assert.ok('location' in parsedObj, 'Result should include location')
        assert.ok('exits' in parsedObj, 'Result should include exits')
        assert.ok('nearbyPlayers' in parsedObj, 'Result should include nearbyPlayers')
    })

    it('should handle case where listPlayersAtLocation is called on empty player set', async () => {
        // ARRANGE
        const fixture = new IntegrationTestFixture()
        await fixture.setup()

        const container = await fixture.getContainer()
        const { WorldContextHandler } = await import('../../src/handlers/mcp/world-context/world-context.js')
        const handler = container.get(WorldContextHandler)

        // ACT: Call with starter location (which should exist)
        const toolArguments = { arguments: {} }
        const mockContext = { invocationId: 'test-invocation' } as Partial<InvocationContext>

        const result = await handler.getLocationContext(toolArguments, mockContext as InvocationContext)
        const parsed = JSON.parse(result) as Record<string, unknown>

        await fixture.teardown()

        // ASSERT: nearbyPlayers should be an array (even if empty)
        assert.ok(Array.isArray(parsed.nearbyPlayers), 'nearbyPlayers should be an array')
    })

    it('should return null for non-existent location without throwing', async () => {
        // ARRANGE
        const fixture = new IntegrationTestFixture()
        await fixture.setup()

        const container = await fixture.getContainer()
        const { WorldContextHandler } = await import('../../src/handlers/mcp/world-context/world-context.js')
        const handler = container.get(WorldContextHandler)

        // ACT: Call with non-existent location ID
        const toolArguments = { arguments: { locationId: '00000000-0000-0000-0000-000000000000' } }
        const mockContext = { invocationId: 'test-invocation' } as Partial<InvocationContext>

        const result = await handler.getLocationContext(toolArguments, mockContext as InvocationContext)

        await fixture.teardown()

        // ASSERT: Should return null for non-existent location (not throw)
        assert.strictEqual(result, 'null')
    })

    it('should handle errors from listPlayersAtLocation gracefully', async () => {
        // ARRANGE: Set up test with a playerDocRepo that throws an error
        const fixture = new IntegrationTestFixture()
        await fixture.setup()

        const container = await fixture.getContainer()

        // Mock the PlayerDocRepository to throw an error
        const mockPlayerRepo = {
            listPlayersAtLocation: async () => {
                throw new Error('Simulated cross-partition query timeout')
            },
            getPlayer: async () => null,
            upsertPlayer: async () => {},
            deletePlayer: async () => false,
            listPlayerIdsByPrefixes: async () => []
        }
        const rebindResult = await container.rebind('IPlayerDocRepository')
        rebindResult.toConstantValue(mockPlayerRepo)

        const { WorldContextHandler } = await import('../../src/handlers/mcp/world-context/world-context.js')
        const handler = container.get(WorldContextHandler)

        // ACT: Call getLocationContext (should not throw despite playerDocRepo error)
        const toolArguments = { arguments: {} }
        const mockContext = { invocationId: 'test-invocation' } as Partial<InvocationContext>

        let result = ''
        let error: Error | null = null

        try {
            result = await handler.getLocationContext(toolArguments, mockContext as InvocationContext)
        } catch (err) {
            error = err as Error
        }

        await fixture.teardown()

        // ASSERT: Should not throw (error handling should catch the playerDocRepo error)
        assert.equal(error, null, `Expected no error, but got: ${error?.message}`)

        // ASSERT: Result should still be valid JSON with empty nearbyPlayers array
        const parsed = JSON.parse(result) as Record<string, unknown>
        assert.ok(Array.isArray(parsed.nearbyPlayers), 'nearbyPlayers should be an array')
        assert.strictEqual(parsed.nearbyPlayers.length, 0, 'nearbyPlayers should be empty when fetch fails')
    })
})
