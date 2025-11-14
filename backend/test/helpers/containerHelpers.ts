/**
 * Test helpers for creating Inversify containers with mocked dependencies
 */

import { Container } from 'inversify'
import { mock } from 'node:test'
import type { IGremlinClient } from '../../src/gremlin/index.js'
import type { IPersistenceConfig } from '../../src/persistenceConfig.js'
import type { ITelemetryClient } from '../../src/telemetry/ITelemetryClient.js'

/**
 * Creates a test container with mocked IGremlinClient
 *
 * @example
 * ```typescript
 * const mockClient: IGremlinClient = {
 *   submit: async (query, bindings) => {
 *     // Return mock data based on query
 *     return []
 *   }
 * }
 *
 * const container = createTestContainer({ gremlinClient: mockClient })
 * const exitRepo = container.get(ExitRepository)
 * ```
 */
export function createTestContainer(options?: {
    gremlinClient?: IGremlinClient
    telemetryClient?: ITelemetryClient
    persistenceMode?: 'memory' | 'cosmos'
}): Container {
    const container = new Container()

    // Mock persistence config
    const config: IPersistenceConfig = {
        mode: options?.persistenceMode || 'memory'
    }
    container.bind<IPersistenceConfig>('PersistenceConfig').toConstantValue(config)

    // If a mock Gremlin client is provided, bind it
    if (options?.gremlinClient) {
        container.bind<IGremlinClient>('GremlinClient').toConstantValue(options.gremlinClient)
    }

    // If a mock TelemetryClient is provided, bind it
    if (options?.telemetryClient) {
        container.bind<ITelemetryClient>('ITelemetryClient').toConstantValue(options.telemetryClient)
    }

    return container
}

/**
 * Creates a simple mock IGremlinClient that returns predefined data
 *
 * @param data - Map of query patterns to response data
 * @example
 * ```typescript
 * const mockClient = createMockGremlinClient({
 *   "outE('exit')": [{ direction: 'north', toLocationId: 'loc-2' }]
 * })
 * ```
 */
export function createMockGremlinClient(data: Record<string, unknown[]>): IGremlinClient {
    return {
        submit: async <T>(query: string): Promise<T[]> => {
            for (const [pattern, response] of Object.entries(data)) {
                if (query.includes(pattern)) {
                    return response as T[]
                }
            }
            return []
        },
        // Added to satisfy updated IGremlinClient interface
        close: async () => {
            /* no-op for mock */
        }
    }
}

/**
 * Creates a mock TelemetryClient that captures telemetry calls for testing
 *
 * @example
 * ```typescript
 * const { client, getEvents, getExceptions } = createMockTelemetryClient()
 * const container = createTestContainer({ telemetryClient: client })
 *
 * // ... run tests ...
 *
 * const events = getEvents()
 * assert.ok(events.find(e => e.name === 'Navigation.Move.Success'))
 * ```
 */
export function createMockTelemetryClient(): {
    client: ITelemetryClient
    getEvents: () => Array<{ name: string; properties?: Record<string, unknown> }>
    getExceptions: () => Array<{ exception: Error; properties?: Record<string, unknown> }>
} {
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
        flush: mock.fn(),
        addTelemetryProcessor: mock.fn()
    } as unknown as ITelemetryClient

    return {
        client,
        getEvents: () => events,
        getExceptions: () => exceptions
    }
}
