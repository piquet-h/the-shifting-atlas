/**
 * Graph partition key constants for Cosmos DB (Gremlin API).
 *
 * MVP Decision (ADR-002): use a single logical partition value to simplify early
 * development & traversal. Centralizing the literals allows low‑diff migration
 * when region-based sharding (or another strategy) is introduced.
 *
 * Test Isolation: Tests use partition "test" to avoid polluting production "world" data.
 */

/** The property name configured as the partition key path (`/partitionKey`). */
export const WORLD_GRAPH_PARTITION_KEY_PROP = 'partitionKey'

/** Production partition value (default). */
export const WORLD_GRAPH_PARTITION_VALUE = 'world'

/** Test partition value (isolated from production). */
export const TEST_GRAPH_PARTITION_VALUE = 'test'

/**
 * Resolves the partition key value based on environment.
 * - Tests (NODE_ENV=test or PARTITION_SCOPE=test): returns "test"
 * - Production/Development: returns "world"
 */
export function resolveGraphPartitionKey(_regionId?: string): string {
    // Intentional no-op for future regional partitioning; mark parameter as used to satisfy lint until implemented.
    void _regionId

    // Check if running in test mode
    if (typeof process !== 'undefined') {
        if (process.env.NODE_ENV === 'test' || process.env.PARTITION_SCOPE === 'test') {
            return TEST_GRAPH_PARTITION_VALUE
        }
    }

    return WORLD_GRAPH_PARTITION_VALUE
}
