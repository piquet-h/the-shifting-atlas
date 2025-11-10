/**
 * Mock implementation of CosmosDbSqlRepository for unit testing.
 * Provides in-memory storage without requiring Azure credentials.
 */

import { NotFoundException, ConcurrencyException } from '@piquet-h/shared'
import { SqlParameter } from '@azure/cosmos'

/**
 * In-memory mock repository for testing
 */
export class MockSqlRepository<T extends { id: string }> {
    private items = new Map<string, T>()
    private containerName: string
    public telemetryEvents: Array<{ event: string; data: Record<string, unknown> }> = []

    constructor(containerName: string) {
        this.containerName = containerName
    }

    /**
     * Get entity by ID and partition key
     */
    async getById(id: string, partitionKey: string): Promise<T | null> {
        const key = `${partitionKey}:${id}`
        const item = this.items.get(key)

        this.telemetryEvents.push({
            event: 'SQL.Query.Executed',
            data: {
                operationName: `${this.containerName}.GetById`,
                resultCount: item ? 1 : 0,
                ruCharge: 1.0
            }
        })

        return item || null
    }

    /**
     * Create a new entity (fails if exists)
     */
    async create(entity: T, partitionKey: string): Promise<{ resource: T; ruCharge: number }> {
        const key = `${partitionKey}:${entity.id}`

        if (this.items.has(key)) {
            this.telemetryEvents.push({
                event: 'SQL.Query.Failed',
                data: {
                    operationName: `${this.containerName}.Create`,
                    httpStatusCode: 409
                }
            })
            throw new ConcurrencyException(`Item with id ${entity.id} already exists`)
        }

        this.items.set(key, { ...entity })

        this.telemetryEvents.push({
            event: 'SQL.Query.Executed',
            data: {
                operationName: `${this.containerName}.Create`,
                resultCount: 1,
                ruCharge: 5.0
            }
        })

        return { resource: entity, ruCharge: 5.0 }
    }

    /**
     * Upsert an entity (create or replace)
     */
    async upsert(entity: T, partitionKey: string): Promise<{ resource: T; ruCharge: number }> {
        const key = `${partitionKey}:${entity.id}`
        this.items.set(key, { ...entity })

        this.telemetryEvents.push({
            event: 'SQL.Query.Executed',
            data: {
                operationName: `${this.containerName}.Upsert`,
                resultCount: 1,
                ruCharge: 5.5
            }
        })

        return { resource: entity, ruCharge: 5.5 }
    }

    /**
     * Replace an entity (update only if exists)
     */
    async replace(id: string, entity: T, partitionKey: string): Promise<{ resource: T; ruCharge: number }> {
        const key = `${partitionKey}:${id}`
        const existing = this.items.get(key)

        if (!existing) {
            this.telemetryEvents.push({
                event: 'SQL.Query.Failed',
                data: {
                    operationName: `${this.containerName}.Replace`,
                    httpStatusCode: 404
                }
            })
            throw new NotFoundException(`Item with id ${id} not found`)
        }

        this.items.set(key, { ...entity })

        this.telemetryEvents.push({
            event: 'SQL.Query.Executed',
            data: {
                operationName: `${this.containerName}.Replace`,
                resultCount: 1,
                ruCharge: 5.0
            }
        })

        return { resource: entity, ruCharge: 5.0 }
    }

    /**
     * Delete an entity
     */
    async delete(id: string, partitionKey: string): Promise<boolean> {
        const key = `${partitionKey}:${id}`
        const existed = this.items.has(key)

        if (existed) {
            this.items.delete(key)
        }

        this.telemetryEvents.push({
            event: 'SQL.Query.Executed',
            data: {
                operationName: `${this.containerName}.Delete`,
                resultCount: existed ? 1 : 0,
                ruCharge: existed ? 5.0 : 0
            }
        })

        return existed
    }

    /**
     * Query entities using SQL query (simplified mock - filters by partition key)
     */
    async query(query: string, parameters?: Array<SqlParameter>, maxResults?: number): Promise<{ items: T[]; ruCharge: number }> {
        // Simplified mock: just return all items from same partition if @pk parameter provided
        const pkParam = parameters?.find((p) => p.name === '@pk')
        const results: T[] = []

        for (const [key, item] of this.items.entries()) {
            if (!pkParam || key.startsWith(`${pkParam.value}:`)) {
                results.push(item)
                if (maxResults && results.length >= maxResults) break
            }
        }

        this.telemetryEvents.push({
            event: 'SQL.Query.Executed',
            data: {
                operationName: `${this.containerName}.Query`,
                resultCount: results.length,
                ruCharge: Math.max(1.0, results.length * 2.0)
            }
        })

        return {
            items: results,
            ruCharge: Math.max(1.0, results.length * 2.0)
        }
    }

    /**
     * Clear all items (for test cleanup)
     */
    clear() {
        this.items.clear()
        this.telemetryEvents = []
    }

    /**
     * Get all items (for test assertions)
     */
    getAllItems(): T[] {
        return Array.from(this.items.values())
    }
}
