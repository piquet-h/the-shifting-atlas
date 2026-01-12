/* eslint-disable @typescript-eslint/no-explicit-any */
import type { InvocationContext } from '@azure/functions'
import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { WorldContextHandler } from '../../src/handlers/mcp/world-context/world-context.js'

function makeContext(): InvocationContext {
    // Minimal InvocationContext mock for tests
    return {
        invocationId: 'test-invocation',
        bindings: {},
        bindingData: {},
        traceContext: {},
        bindingDefinitions: [],
        // Provide a function-style logger (Azure Functions context.log is a function)
        log: (() => {}) as unknown as ((msg?: unknown, ...params: unknown[]) => void) & {
            verbose?: (...args: unknown[]) => void
            info?: (...args: unknown[]) => void
            warn?: (...args: unknown[]) => void
            error?: (...args: unknown[]) => void
        }
    } as unknown as InvocationContext
}

describe('WorldContextHandler', () => {
    it('health returns ok JSON', async () => {
        const handler = new WorldContextHandler()
        const ctx = makeContext()
        const result = await handler.health({ arguments: {} }, ctx)

        const parsed = JSON.parse(result)
        assert.equal(parsed.ok, true)
        assert.equal(parsed.service, 'world-context')
    })
})
