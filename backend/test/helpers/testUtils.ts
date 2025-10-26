import { TestMocks } from './TestFixture.js'

// Re-export TestMocks for convenience
export { TestMocks }

/** Simple header bag with case-insensitive keys */
export class HeaderBag {
    private m: Record<string, string> = {}
    set(k: string, v: string) {
        this.m[k.toLowerCase()] = v
    }
    get(k: string) {
        return this.m[k.toLowerCase()] || null
    }
}

/** Build SWA client principal header payload (base64 encoded JSON) */
export function makePrincipalPayload(
    overrides: Partial<{ userId: string; userDetails: string; identityProvider: string; userRoles: string[] }> = {}
) {
    const base = {
        userId: 'ABC123',
        userDetails: 'user@example.com',
        identityProvider: 'github',
        userRoles: ['authenticated'],
        ...overrides
    }
    const json = JSON.stringify(base)
    const b64 = Buffer.from(json, 'utf8').toString('base64')
    return { json, b64 }
}

/** Build a move request-like object used by move handler core tests */
export function makeMoveRequest(query: Record<string, string>, headers?: Record<string, string>): unknown {
    return {
        method: 'GET',
        url: 'http://localhost/api/player/move',
        query: { get: (k: string) => query[k] || null },
        headers: { get: (name: string) => headers?.[name] || null }
    }
}

/** Build a location request-like object used by location handler tests */
export function makeLocationRequest(id?: string): unknown {
    return {
        method: 'GET',
        url: 'http://localhost/api/location',
        query: { get: (k: string) => (k === 'id' ? id || null : null) },
        headers: { get: () => null }
    }
}

/**
 * Mock an Azure Functions InvocationContext using node:test mocks.
 * Provides accessors for collected log + error call args.
 * @deprecated Use TestMocks.createInvocationContext() from TestFixture instead
 */
export interface TestInvocationContext {
    log: (...args: unknown[]) => void
    error: (...args: unknown[]) => void
    warn: (...args: unknown[]) => void
    info: (...args: unknown[]) => void
    debug: (...args: unknown[]) => void
    trace: (...args: unknown[]) => void
    invocationId: string
    functionName: string
    getLogs: () => unknown[][]
    getErrors: () => unknown[][]
}

/**
 * @deprecated Use TestMocks.createInvocationContext() from TestFixture instead
 */
export function mockInvocationContext(): TestInvocationContext {
    return TestMocks.createInvocationContext() as TestInvocationContext
}

/**
 * Mock telemetryClient.trackEvent for testing telemetry emission.
 * The test must import telemetryClient directly to ensure same instance.
 * @deprecated Use IntegrationTestFixture.setupTelemetryMock() or TestMocks.createTelemetryClient() instead
 * Usage:
 *   import { telemetryClient } from '../src/telemetry.js'
 *   const { getEvents, restore } = mockTelemetry(telemetryClient)
 *   try {
 *     // ... test code that emits events
 *     const events = getEvents()
 *     assert.ok(events.find(e => e.name === 'Location.Move'))
 *   } finally {
 *     restore()
 *   }
 */
export function mockTelemetry(client: { trackEvent: (payload: { name: string; properties?: Record<string, unknown> }) => void }) {
    const mockResult = TestMocks.createTelemetryClient()
    const original = client.trackEvent

    client.trackEvent = mockResult.client.trackEvent

    return {
        restore: () => {
            client.trackEvent = original
        },
        getEvents: () => mockResult.getEvents()
    }
}

/**
 * Create a minimal HttpRequest mock for Azure Functions handler testing
 * @deprecated Use TestMocks.createHttpRequest() from TestFixture instead
 */
export function makeHttpRequest(options: { playerGuidHeader?: string; headers?: Map<string, string> } = {}): unknown {
    const headersObj: Record<string, string> = {}
    if (options.headers) {
        options.headers.forEach((value, key) => {
            headersObj[key] = value
        })
    }
    if (options.playerGuidHeader) {
        headersObj['x-player-guid'] = options.playerGuidHeader
    }

    return TestMocks.createHttpRequest({
        method: 'GET',
        url: 'http://localhost/api/test',
        headers: headersObj
    })
}
