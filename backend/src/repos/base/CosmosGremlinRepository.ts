/**
 * Abstract base class for Cosmos Gremlin repositories.
 * Provides common functionality for querying and managing graph vertices/edges.
 */
import { inject, injectable } from 'inversify'
import type { GremlinQueryResult, IGremlinClient } from '../../gremlin/gremlinClient.js'
import { resolveGraphPartitionKey, WORLD_GRAPH_PARTITION_KEY_PROP } from '../../persistence/graphPartition.js'
import { trackGameEventStrict } from '../../telemetry.js'

@injectable()
export abstract class CosmosGremlinRepository {
    constructor(@inject('GremlinClient') protected client: IGremlinClient) {}

    /**
     * Get the partition key value for the current environment.
     * Returns 'test' for test environments, 'world' for production.
     */
    protected get partitionKey(): string {
        return resolveGraphPartitionKey()
    }

    /**
     * Get the partition key property name configured in Cosmos DB.
     */
    protected get partitionKeyProp(): string {
        return WORLD_GRAPH_PARTITION_KEY_PROP
    }

    /**
     * Execute a Gremlin query with automatic partition key injection.
     * The partition key is automatically added to bindings as 'pk'.
     * @param query - Gremlin query string
     * @param bindings - Query parameter bindings
     * @returns Array of query results
     */
    protected async query<T>(query: string, bindings: Record<string, unknown> = {}): Promise<T[]> {
        return this.client.submit<T>(query, {
            ...bindings,
            pk: this.partitionKey
        })
    }

    /**
     * Execute a Gremlin query with telemetry tracking.
     * Emits Graph.Query.Executed or Graph.Query.Failed events with RU and latency metrics.
     * @param operationName - Human-readable operation name for telemetry
     * @param query - Gremlin query string
     * @param bindings - Query parameter bindings
     * @returns Array of query results
     */
    protected async queryWithTelemetry<T>(operationName: string, query: string, bindings: Record<string, unknown> = {}): Promise<T[]> {
        const startTime = Date.now()
        let success = false
        let result: GremlinQueryResult<T> | undefined

        try {
            result = await this.client.submitWithMetrics<T>(query, {
                ...bindings,
                pk: this.partitionKey
            })
            success = true
            return result.items
        } catch (error) {
            const latencyMs = Date.now() - startTime
            trackGameEventStrict('Graph.Query.Failed', {
                operationName,
                latencyMs,
                errorMessage: error instanceof Error ? error.message : 'Unknown error'
            })
            throw error
        } finally {
            if (success && result) {
                trackGameEventStrict('Graph.Query.Executed', {
                    operationName,
                    latencyMs: result.latencyMs,
                    ruCharge: result.requestCharge,
                    resultCount: result.items.length
                })
            }
        }
    }

    /**
     * Ensure a vertex exists (upsert pattern using fold + coalesce).
     * Creates the vertex if it doesn't exist, otherwise returns existing vertex.
     * @param label - Vertex label (e.g., 'player', 'location')
     * @param id - Vertex ID
     * @param properties - Optional additional properties to set on creation
     */
    protected async ensureVertex(label: string, id: string, properties: Record<string, unknown> = {}): Promise<void> {
        let query = `g.V(vid).fold().coalesce(unfold(), addV(label).property('id', vid).property('${this.partitionKeyProp}', pk))`

        const bindings: Record<string, unknown> = {
            vid: id,
            label,
            pk: this.partitionKey
        }

        // Add additional properties
        Object.entries(properties).forEach(([key, value], index) => {
            const propKey = `prop${index}`
            bindings[propKey] = value
            query += `.property('${key}', ${propKey})`
        })

        await this.client.submit(query, bindings)
    }

    /**
     * Check if a vertex exists by ID.
     * @param id - Vertex ID to check
     * @returns True if vertex exists, false otherwise
     */
    protected async vertexExists(id: string): Promise<boolean> {
        const result = await this.query<Record<string, unknown>>('g.V(vid).limit(1)', { vid: id })
        return result.length > 0
    }

    /**
     * Delete a vertex by ID.
     * @param id - Vertex ID to delete
     */
    protected async deleteVertex(id: string): Promise<void> {
        await this.query('g.V(vid).drop()', { vid: id })
    }
}
