import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { gremlinHealth } from '../../src/handlers/gremlinHealth.js'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'

interface GremlinHealthResponse {
    mode: 'memory' | 'cosmos'
    canQuery: boolean
    latencyMs: number
    strictFallback: boolean
    reason?: string
}

interface ResponseWithBody {
    status?: number
    jsonBody?:
        | {
              success?: boolean
              data?: GremlinHealthResponse
              correlationId?: string
          }
        | GremlinHealthResponse
    headers?: Record<string, string>
}

describe('GremlinHealthHandler', () => {
    let fixture: UnitTestFixture

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('Response Structure', () => {
        test('should return success envelope with health data', async () => {
            const req = fixture.createHttpRequest({
                method: 'GET',
                url: 'http://localhost/api/backend/health/gremlin'
            })
            const ctx = await fixture.createInvocationContext()
            const response = (await gremlinHealth(req as never, ctx)) as ResponseWithBody

            assert.strictEqual(response.status, 200)
            const envelope = response.jsonBody as { success?: boolean; data?: GremlinHealthResponse }
            assert.strictEqual(envelope.success, true)
            assert.ok(envelope.data, 'response should contain data field')
        })

        test('should include required health response fields', async () => {
            const req = fixture.createHttpRequest({
                method: 'GET',
                url: 'http://localhost/api/backend/health/gremlin'
            })
            const ctx = await fixture.createInvocationContext()
            const response = (await gremlinHealth(req as never, ctx)) as ResponseWithBody

            const envelope = response.jsonBody as { success?: boolean; data?: GremlinHealthResponse }
            const body = envelope.data!

            // Verify all required fields are present
            assert.ok('mode' in body, 'should have mode field')
            assert.ok('canQuery' in body, 'should have canQuery field')
            assert.ok('latencyMs' in body, 'should have latencyMs field')
            assert.ok('strictFallback' in body, 'should have strictFallback field')

            // Verify types
            assert.ok(['memory', 'cosmos'].includes(body.mode), 'mode should be memory or cosmos')
            assert.strictEqual(typeof body.canQuery, 'boolean', 'canQuery should be boolean')
            assert.strictEqual(typeof body.latencyMs, 'number', 'latencyMs should be number')
            assert.strictEqual(typeof body.strictFallback, 'boolean', 'strictFallback should be boolean')
        })

        test('should include correlation ID in response headers', async () => {
            const req = fixture.createHttpRequest({
                method: 'GET',
                url: 'http://localhost/api/backend/health/gremlin'
            })
            const ctx = await fixture.createInvocationContext()
            const response = (await gremlinHealth(req as never, ctx)) as ResponseWithBody

            assert.ok(response.headers, 'response should have headers')
            const headers = response.headers as Record<string, string>
            assert.ok(headers['x-correlation-id'], 'should include x-correlation-id header')
        })
    })

    describe('Health Status Logic', () => {
        test('should return healthy status (200) in mock mode', async () => {
            // Mock mode (used by UnitTestFixture) should always return healthy
            const req = fixture.createHttpRequest({
                method: 'GET',
                url: 'http://localhost/api/backend/health/gremlin'
            })
            const ctx = await fixture.createInvocationContext()
            const response = (await gremlinHealth(req as never, ctx)) as ResponseWithBody

            assert.strictEqual(response.status, 200)
            const envelope = response.jsonBody as { success?: boolean; data?: GremlinHealthResponse }
            assert.strictEqual(envelope.success, true)
        })

        test('should report canQuery as true in mock mode', async () => {
            // Mock mode uses injected PersistenceConfig with mode='memory'
            // Memory mode should always report canQuery=true (no real DB connection needed)
            const req = fixture.createHttpRequest({
                method: 'GET',
                url: 'http://localhost/api/backend/health/gremlin'
            })
            const ctx = await fixture.createInvocationContext()
            const response = (await gremlinHealth(req as never, ctx)) as ResponseWithBody

            const envelope = response.jsonBody as { success?: boolean; data?: GremlinHealthResponse }
            assert.strictEqual(envelope.data!.mode, 'memory')
            assert.strictEqual(envelope.data!.canQuery, true)
        })

        test('should set latencyMs to 0 for memory mode', async () => {
            // Memory/mock mode doesn't perform real queries, so latency should be 0
            const req = fixture.createHttpRequest({
                method: 'GET',
                url: 'http://localhost/api/backend/health/gremlin'
            })
            const ctx = await fixture.createInvocationContext()
            const response = (await gremlinHealth(req as never, ctx)) as ResponseWithBody

            const envelope = response.jsonBody as { success?: boolean; data?: GremlinHealthResponse }
            assert.strictEqual(envelope.data!.mode, 'memory')
            assert.strictEqual(envelope.data!.latencyMs, 0)
        })
    })

    describe('Telemetry', () => {
        test('should emit Health.Gremlin.Check telemetry event', async () => {
            const req = fixture.createHttpRequest({
                method: 'GET',
                url: 'http://localhost/api/backend/health/gremlin'
            })
            const ctx = await fixture.createInvocationContext()
            await gremlinHealth(req as never, ctx)

            const telemetryClient = await fixture.getTelemetryClient()
            const events = telemetryClient.events

            const healthEvent = events.find((e) => e.name === 'Health.Gremlin.Check')
            assert.ok(healthEvent, 'should emit Health.Gremlin.Check event')
            assert.ok(healthEvent.properties, 'event should have properties')
            assert.ok(healthEvent.properties.mode, 'event should include mode property')
            assert.ok('canQuery' in healthEvent.properties, 'event should include canQuery property')
        })
    })
})
