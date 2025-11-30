/* eslint-disable @typescript-eslint/no-explicit-any */
import type { InvocationContext } from '@azure/functions'
import { strict as assert } from 'assert'
import { beforeEach, describe, it } from 'node:test'
import sinon from 'sinon'
import { WorldHandler } from '../../src/handlers/mcp/world/world.js'

class FakeTelemetryService {
    trackGameEventStrict() {}
}

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

describe('WorldHandler', () => {
    let locationRepo: { get: sinon.SinonStub }
    let exitRepo: { getExits: sinon.SinonStub }
    let telemetry: FakeTelemetryService

    beforeEach(() => {
        locationRepo = { get: sinon.stub() }
        exitRepo = { getExits: sinon.stub() }
        telemetry = new FakeTelemetryService()
    })

    it('getLocation returns location JSON', async () => {
        const sample = { id: 'loc-1', name: 'Test Loc' }
        locationRepo.get.resolves(sample)

        const handler = new WorldHandler(telemetry as unknown as any, locationRepo as unknown as any, exitRepo as unknown as any)
        const ctx = makeContext()
        const result = await handler.getLocation({ arguments: {} }, ctx)

        const parsed = JSON.parse(result)
        assert.equal(parsed.id, 'loc-1')
        assert.equal(parsed.name, 'Test Loc')
    })

    it('listExits returns exits JSON', async () => {
        const exits = [{ direction: 'north', to: 'loc-2' }]
        exitRepo.getExits.resolves(exits)

        const handler = new WorldHandler(telemetry as unknown as any, locationRepo as unknown as any, exitRepo as unknown as any)
        const ctx = makeContext()
        const result = await handler.listExits({ arguments: {} }, ctx)

        const parsed = JSON.parse(result)
        assert.ok(Array.isArray(parsed.exits))
        assert.equal(parsed.exits[0].direction, 'north')
    })
})
