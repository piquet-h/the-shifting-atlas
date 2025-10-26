/**
 * Base Test Fixture - Provides common setup/teardown patterns for all tests
 *
 * This base class provides:
 * - Lifecycle hooks (setup/teardown)
 * - Shared mock instances
 * - Resource cleanup tracking
 */

import type { InvocationContext } from '@azure/functions'
import type appInsights from 'applicationinsights'
import { mock } from 'node:test'

/** Base class for all test fixtures with common setup/teardown patterns */
export abstract class BaseTestFixture {
    /** Resources to clean up after test */
    protected cleanupTasks: Array<() => void | Promise<void>> = []

    /** Register a cleanup task to run during teardown */
    protected registerCleanup(task: () => void | Promise<void>): void {
        this.cleanupTasks.push(task)
    }

    /** Setup hook - override in subclasses for custom setup */
    async setup(): Promise<void> {
        // Override in subclasses
    }

    /** Teardown hook - automatically runs all registered cleanup tasks */
    async teardown(): Promise<void> {
        for (const task of this.cleanupTasks) {
            await task()
        }
        this.cleanupTasks = []
    }
}

/** Mock tracking result from telemetry client */
export interface TelemetryMockResult {
    client: appInsights.TelemetryClient
    getEvents: () => Array<{ name: string; properties?: Record<string, unknown> }>
    getExceptions: () => Array<{ exception: Error; properties?: Record<string, unknown> }>
}

/** Mock tracking result from InvocationContext */
export interface InvocationContextMockResult extends InvocationContext {
    getLogs: () => unknown[][]
    getErrors: () => unknown[][]
}

/**
 * Shared Mock Factory - Creates common mocks used across tests
 * Centralizes mock creation to eliminate duplication
 */
export class TestMocks {
    /**
     * Create a mock Application Insights TelemetryClient
     * Captures trackEvent and trackException calls for assertions
     */
    static createTelemetryClient(): TelemetryMockResult {
        const events: Array<{ name: string; properties?: Record<string, unknown> }> = []
        const exceptions: Array<{ exception: Error; properties?: Record<string, unknown> }> = []

        const client = {
            trackEvent: mock.fn((payload: { name: string; properties?: Record<string, unknown> }) => {
                events.push(payload)
            }),
            trackException: mock.fn((payload: { exception: Error; properties?: Record<string, unknown> }) => {
                exceptions.push(payload)
            }),
            trackMetric: mock.fn(),
            trackTrace: mock.fn(),
            trackDependency: mock.fn(),
            trackRequest: mock.fn(),
            flush: mock.fn()
        } as unknown as appInsights.TelemetryClient

        return {
            client,
            getEvents: () => events,
            getExceptions: () => exceptions
        }
    }

    /**
     * Create a mock InvocationContext for Azure Functions
     * Captures log and error calls for assertions
     */
    static createInvocationContext(overrides?: Partial<InvocationContext>): InvocationContextMockResult {
        const logFn = mock.fn(() => {})
        const errorFn = mock.fn(() => {})
        const warnFn = mock.fn(() => {})
        const infoFn = mock.fn(() => {})
        const debugFn = mock.fn(() => {})
        const traceFn = mock.fn(() => {})

        interface MockCall {
            arguments: unknown[]
        }

        return {
            log: logFn,
            error: errorFn,
            warn: warnFn,
            info: infoFn,
            debug: debugFn,
            trace: traceFn,
            invocationId: 'test-invocation-id',
            functionName: 'TestFunction',
            extraInputs: new Map(),
            getLogs: () => logFn.mock.calls.map((c: MockCall) => c.arguments),
            getErrors: () => errorFn.mock.calls.map((c: MockCall) => c.arguments),
            ...overrides
        } as InvocationContextMockResult
    }

    /**
     * Create a mock HttpRequest for Azure Functions
     */
    static createHttpRequest(options: {
        method?: string
        url?: string
        query?: Record<string, string>
        headers?: Record<string, string>
        body?: unknown
    } = {}): unknown {
        const {
            method = 'GET',
            url = 'http://localhost/api/test',
            query = {},
            headers = {},
            body = undefined
        } = options

        const headersMap = new Map<string, string>(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))

        return {
            method,
            url,
            headers: {
                get: (key: string) => headersMap.get(key.toLowerCase()) || null,
                has: (key: string) => headersMap.has(key.toLowerCase()),
                entries: () => headersMap.entries(),
                keys: () => headersMap.keys(),
                values: () => headersMap.values(),
                forEach: (cb: (value: string, key: string) => void) => headersMap.forEach(cb),
                set: (key: string, value: string) => headersMap.set(key.toLowerCase(), value),
                delete: (key: string) => headersMap.delete(key.toLowerCase()),
                append: (key: string, value: string) => headersMap.set(key.toLowerCase(), value)
            },
            query: {
                get: (key: string) => query[key] || null,
                has: (key: string) => key in query,
                entries: () => Object.entries(query)[Symbol.iterator](),
                keys: () => Object.keys(query)[Symbol.iterator](),
                values: () => Object.values(query)[Symbol.iterator](),
                forEach: (cb: (value: string, key: string) => void) => Object.entries(query).forEach(([k, v]) => cb(v, k)),
                set: () => {},
                delete: () => false,
                append: () => {}
            },
            params: {},
            user: null,
            body,
            bodyUsed: false,
            arrayBuffer: async () => new ArrayBuffer(0),
            blob: async () => new Blob(),
            formData: async () => new FormData(),
            json: async () => body || {},
            text: async () => (typeof body === 'string' ? body : JSON.stringify(body || {})),
            clone: () => TestMocks.createHttpRequest(options)
        }
    }
}
