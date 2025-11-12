/**
 * Abstract base class for Cosmos DB SQL API repositories.
 * Provides common CRUD operations with error handling and telemetry.
 *
 * Purpose: Zero direct @azure/cosmos SDK calls outside repository layer.
 * All SQL API operations should extend this class.
 *
 * Pattern: Follows same dependency injection approach as CosmosGremlinRepository.
 * Concrete repositories inject container name via constructor and receive CosmosClient from DI.
 */

import type { Container, ItemResponse, FeedResponse, SqlParameter } from '@azure/cosmos'
import { translateCosmosError } from '@piquet-h/shared'
import { injectable } from 'inversify'
import { trackGameEventStrict } from '../../telemetry.js'
import type { ICosmosDbSqlClient } from './cosmosDbSqlClient.js'

/**
 * Base repository for SQL API operations
 */
@injectable()
export abstract class CosmosDbSqlRepository<T extends { id: string }> {
    protected container: Container
    protected containerName: string

    /**
     * Constructor receives SQL client via dependency injection (like GremlinClient pattern)
     * @param client - Injected Cosmos SQL client
     * @param containerName - Container name for this repository
     */
    constructor(
        protected client: ICosmosDbSqlClient,
        containerName: string
    ) {
        this.containerName = containerName
        this.container = client.getContainer(containerName)
    }

    /**
     * Get entity by ID and partition key
     * @param id - Entity ID
     * @param partitionKey - Partition key value
     * @returns Entity or null if not found
     */
    protected async getById(id: string, partitionKey: string): Promise<T | null> {
        const operationName = `${this.containerName}.GetById`
        const startTime = Date.now()

        try {
            const response: ItemResponse<T> = await this.container.item(id, partitionKey).read<T>()
            const latencyMs = Date.now() - startTime

            if (response.resource) {
                trackGameEventStrict('SQL.Query.Executed', {
                    operationName,
                    latencyMs,
                    ruCharge: response.requestCharge,
                    resultCount: 1,
                    partitionKey,
                    containerName: this.containerName
                })
                return response.resource
            }

            return null
        } catch (error) {
            const latencyMs = Date.now() - startTime
            const cosmosError = error as { code?: number }

            // 404 is expected for not found, don't throw
            if (cosmosError.code === 404) {
                trackGameEventStrict('SQL.Query.Executed', {
                    operationName,
                    latencyMs,
                    ruCharge: 0,
                    resultCount: 0,
                    partitionKey,
                    containerName: this.containerName
                })
                return null
            }

            trackGameEventStrict('SQL.Query.Failed', {
                operationName,
                latencyMs,
                httpStatusCode: cosmosError.code,
                partitionKey,
                containerName: this.containerName
            })

            throw translateCosmosError(error, operationName)
        }
    }

    /**
     * Create a new entity (insert only, fails if exists)
     * @param entity - Entity to create
     * @returns Created entity with RU charge
     */
    protected async create(entity: T): Promise<{ resource: T; ruCharge: number }> {
        const operationName = `${this.containerName}.Create`
        const startTime = Date.now()

        try {
            const response: ItemResponse<T> = await this.container.items.create<T>(entity)
            const latencyMs = Date.now() - startTime

            trackGameEventStrict('SQL.Query.Executed', {
                operationName,
                latencyMs,
                ruCharge: response.requestCharge,
                resultCount: 1,
                partitionKey: entity.id,
                containerName: this.containerName
            })

            return {
                resource: response.resource!,
                ruCharge: response.requestCharge
            }
        } catch (error) {
            const latencyMs = Date.now() - startTime
            const cosmosError = error as { code?: number }

            trackGameEventStrict('SQL.Query.Failed', {
                operationName,
                latencyMs,
                httpStatusCode: cosmosError.code,
                partitionKey: entity.id,
                containerName: this.containerName
            })

            throw translateCosmosError(error, operationName)
        }
    }

    /**
     * Upsert an entity (create or replace)
     * @param entity - Entity to upsert
     * @returns Upserted entity with RU charge
     */
    protected async upsert(entity: T): Promise<{ resource: T; ruCharge: number }> {
        const operationName = `${this.containerName}.Upsert`
        const startTime = Date.now()

        try {
            const response: ItemResponse<T> = await this.container.items.upsert<T>(entity)
            const latencyMs = Date.now() - startTime

            trackGameEventStrict('SQL.Query.Executed', {
                operationName,
                latencyMs,
                ruCharge: response.requestCharge,
                resultCount: 1,
                partitionKey: entity.id,
                containerName: this.containerName
            })

            return {
                resource: response.resource!,
                ruCharge: response.requestCharge
            }
        } catch (error) {
            const latencyMs = Date.now() - startTime
            const cosmosError = error as { code?: number }

            trackGameEventStrict('SQL.Query.Failed', {
                operationName,
                latencyMs,
                httpStatusCode: cosmosError.code,
                partitionKey: entity.id,
                containerName: this.containerName
            })

            throw translateCosmosError(error, operationName)
        }
    }

    /**
     * Replace an entity (update only if exists)
     * @param id - Entity ID
     * @param entity - Updated entity
     * @param partitionKey - Partition key value
     * @param etag - Optional etag for optimistic concurrency
     * @returns Updated entity with RU charge
     */
    protected async replace(id: string, entity: T, partitionKey: string, etag?: string): Promise<{ resource: T; ruCharge: number }> {
        const operationName = `${this.containerName}.Replace`
        const startTime = Date.now()

        try {
            const options = etag ? { accessCondition: { type: 'IfMatch', condition: etag } } : undefined
            const response: ItemResponse<T> = await this.container.item(id, partitionKey).replace<T>(entity, options)
            const latencyMs = Date.now() - startTime

            trackGameEventStrict('SQL.Query.Executed', {
                operationName,
                latencyMs,
                ruCharge: response.requestCharge,
                resultCount: 1,
                partitionKey,
                containerName: this.containerName
            })

            return {
                resource: response.resource!,
                ruCharge: response.requestCharge
            }
        } catch (error) {
            const latencyMs = Date.now() - startTime
            const cosmosError = error as { code?: number }

            trackGameEventStrict('SQL.Query.Failed', {
                operationName,
                latencyMs,
                httpStatusCode: cosmosError.code,
                partitionKey,
                containerName: this.containerName
            })

            throw translateCosmosError(error, operationName)
        }
    }

    /**
     * Delete an entity
     * @param id - Entity ID
     * @param partitionKey - Partition key value
     * @returns Whether entity was deleted
     */
    protected async delete(id: string, partitionKey: string): Promise<boolean> {
        const operationName = `${this.containerName}.Delete`
        const startTime = Date.now()

        try {
            const response = await this.container.item(id, partitionKey).delete()
            const latencyMs = Date.now() - startTime

            trackGameEventStrict('SQL.Query.Executed', {
                operationName,
                latencyMs,
                ruCharge: response.requestCharge,
                resultCount: 1,
                partitionKey,
                containerName: this.containerName
            })

            return true
        } catch (error) {
            const latencyMs = Date.now() - startTime
            const cosmosError = error as { code?: number }

            // 404 means already deleted
            if (cosmosError.code === 404) {
                trackGameEventStrict('SQL.Query.Executed', {
                    operationName,
                    latencyMs,
                    ruCharge: 0,
                    resultCount: 0,
                    partitionKey,
                    containerName: this.containerName
                })
                return false
            }

            trackGameEventStrict('SQL.Query.Failed', {
                operationName,
                latencyMs,
                httpStatusCode: cosmosError.code,
                partitionKey,
                containerName: this.containerName
            })

            throw translateCosmosError(error, operationName)
        }
    }

    /**
     * Query entities using SQL query
     * @param query - SQL query string
     * @param parameters - Query parameters
     * @param maxResults - Maximum number of results
     * @returns Array of matching entities with total RU charge
     */
    protected async query(query: string, parameters?: Array<SqlParameter>, maxResults?: number): Promise<{ items: T[]; ruCharge: number }> {
        const operationName = `${this.containerName}.Query`
        const startTime = Date.now()
        let totalRU = 0

        try {
            const querySpec = { query, parameters: parameters || [] }
            const options = maxResults ? { maxItemCount: maxResults } : undefined
            const iterator = this.container.items.query<T>(querySpec, options)

            const results: T[] = []
            let hasMoreResults = iterator.hasMoreResults()

            while (hasMoreResults) {
                const response: FeedResponse<T> = await iterator.fetchNext()
                totalRU += response.requestCharge
                if (response.resources) {
                    results.push(...response.resources)
                }
                hasMoreResults = iterator.hasMoreResults()
            }

            const latencyMs = Date.now() - startTime

            trackGameEventStrict('SQL.Query.Executed', {
                operationName,
                latencyMs,
                ruCharge: totalRU,
                resultCount: results.length,
                containerName: this.containerName,
                // Note: queries may span multiple partitions, partitionKey not included
                crossPartitionQuery: true
            })

            return {
                items: results,
                ruCharge: totalRU
            }
        } catch (error) {
            const latencyMs = Date.now() - startTime
            const cosmosError = error as { code?: number }

            trackGameEventStrict('SQL.Query.Failed', {
                operationName,
                latencyMs,
                httpStatusCode: cosmosError.code,
                containerName: this.containerName,
                crossPartitionQuery: true
            })

            throw translateCosmosError(error, operationName)
        }
    }
}
