import { mock } from 'node:test'

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
export function makeMoveRequest(query: Record<string, string>, headers?: Record<string, string>): any {
    return {
        method: 'GET',
        url: 'http://localhost/api/player/move',
        query: { get: (k: string) => query[k] || null },
        headers: { get: (name: string) => headers?.[name] || null }
    }
}

/** Build a location request-like object used by location handler tests */
export function makeLocationRequest(id?: string): any {
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

export function mockInvocationContext(): TestInvocationContext {
    const logFn = mock.fn((..._args: unknown[]) => {})
    const errorFn = mock.fn((..._args: unknown[]) => {})
    const warnFn = mock.fn((..._args: unknown[]) => {})
    const infoFn = mock.fn((..._args: unknown[]) => {})
    const debugFn = mock.fn((..._args: unknown[]) => {})
    const traceFn = mock.fn((..._args: unknown[]) => {})

    return {
        log: (...args: unknown[]) => logFn(...args),
        error: (...args: unknown[]) => errorFn(...args),
        warn: (...args: unknown[]) => warnFn(...args),
        info: (...args: unknown[]) => infoFn(...args),
        debug: (...args: unknown[]) => debugFn(...args),
        trace: (...args: unknown[]) => traceFn(...args),
        invocationId: 'test-invocation-id',
        functionName: 'QueueProcessWorldEvent',
        getLogs: () => logFn.mock.calls.map((c: any) => c.arguments as unknown[]),
        getErrors: () => errorFn.mock.calls.map((c: any) => c.arguments as unknown[])
    }
}

/**
 * Mock telemetryClient.trackEvent for testing telemetry emission.
 * The test must import telemetryClient directly to ensure same instance.
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
    const events: Array<{ name: string; properties?: Record<string, unknown> }> = []
    const original = client.trackEvent

    client.trackEvent = (payload: { name: string; properties?: Record<string, unknown> }) => {
        events.push(payload)
    }

    return {
        restore: () => {
            client.trackEvent = original
        },
        getEvents: () => events
    }
}

/** Create a minimal HttpRequest mock for Azure Functions handler testing */
export function makeHttpRequest(options: { playerGuidHeader?: string; headers?: Map<string, string> } = {}): any {
    const headers = options.headers || new Map<string, string>()
    if (options.playerGuidHeader) headers.set('x-player-guid', options.playerGuidHeader)
    return {
        method: 'GET',
        url: 'http://localhost/api/test',
        headers: {
            get: (key: string) => headers.get(key.toLowerCase()) || null,
            has: (key: string) => headers.has(key.toLowerCase()),
            entries: () => headers.entries(),
            keys: () => headers.keys(),
            values: () => headers.values(),
            forEach: (cb: (value: string, key: string) => void) => headers.forEach(cb),
            set: (key: string, value: string) => headers.set(key.toLowerCase(), value),
            delete: (key: string) => headers.delete(key.toLowerCase()),
            append: (key: string, value: string) => headers.set(key.toLowerCase(), value)
        },
        query: {
            get: () => null,
            has: () => false,
            entries: () => [][Symbol.iterator](),
            keys: () => [][Symbol.iterator](),
            values: () => [][Symbol.iterator](),
            forEach: () => {},
            set: () => {},
            delete: () => false,
            append: () => {}
        },
        params: {},
        user: null,
        body: undefined,
        bodyUsed: false,
        arrayBuffer: async () => new ArrayBuffer(0),
        blob: async () => new Blob(),
        formData: async () => new FormData(),
        json: async () => ({}),
        text: async () => '',
        clone: () => makeHttpRequest(options)
    }
}
