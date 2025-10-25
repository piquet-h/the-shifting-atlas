/**
 * Test helpers for creating Inversify containers with mocked dependencies
 */

import { Container } from 'inversify'
import type { IGremlinClient } from '../../src/gremlin/index.js'
import type { IPersistenceConfig } from '../../src/persistenceConfig.js'

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
export function createTestContainer(options?: { gremlinClient?: IGremlinClient; persistenceMode?: 'memory' | 'cosmos' }): Container {
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
        submit: async <T>(query: string, _bindings?: Record<string, unknown>): Promise<T[]> => {
            for (const [pattern, response] of Object.entries(data)) {
                if (query.includes(pattern)) {
                    return response as T[]
                }
            }
            return []
        }
    }
}
