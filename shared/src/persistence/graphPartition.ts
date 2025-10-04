/**
 * Graph partition key constants for Cosmos DB (Gremlin API).
 *
 * MVP Decision (ADR-002): use a single logical partition value to simplify early
 * development & traversal. Centralizing the literals allows low‑diff migration
 * when region-based sharding (or another strategy) is introduced.
 */

/** The property name configured as the partition key path (`/partitionKey`). */
export const WORLD_GRAPH_PARTITION_KEY_PROP = 'partitionKey'

/** Current single-partition value (all vertices share this). */
export const WORLD_GRAPH_PARTITION_VALUE = 'world'

/**
 * Future hook: accept region or shard id, return partition key value. For now
 * always returns the global value. Replace implementation during migration.
 */
export function resolveGraphPartitionKey(_regionId?: string): string {
    // Intentional no-op for future regional partitioning; mark parameter as used to satisfy lint until implemented.
    void _regionId
    return WORLD_GRAPH_PARTITION_VALUE
}
