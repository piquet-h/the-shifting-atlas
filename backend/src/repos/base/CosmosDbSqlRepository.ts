/**
 * Abstract base class for Cosmos DB SQL API repositories.
 * Provides common CRUD operations with error handling and telemetry.
 *
 * Purpose: Zero direct @azure/cosmos SDK calls outside repository layer.
 * All SQL API operations should extend this class.
 */

import { CosmosClient, Container, Database, ItemResponse, FeedResponse, SqlParameter } from '@azure/cosmos'
import { DefaultAzureCredential } from '@azure/identity'
import { translateCosmosError } from '@piquet-h/shared'
import { injectable } from 'inversify'
import { trackGameEventStrict } from '../../telemetry.js'

/**
 * Configuration for Cosmos SQL client
 */
export interface CosmosDbSqlConfig {
    endpoint: string
    database: string
    container: string
    useKeyVault?: boolean
    key?: string
}

/**
 * Base repository for SQL API operations
 */
@injectable()
export abstract class CosmosDbSqlRepository<T extends { id: string }> {
    protected client: CosmosClient
    protected database: Database
    protected container: Container
    protected containerName: string
    protected databaseName: string

    constructor(config: CosmosDbSqlConfig) {
        // Use Managed Identity (DefaultAzureCredential) for authentication unless key provided
        if (config.key) {
            this.client = new CosmosClient({ endpoint: config.endpoint, key: config.key })
        } else {
            const credential = new DefaultAzureCredential()
            this.client = new CosmosClient({ endpoint: config.endpoint, aadCredentials: credential })
        }

        this.databaseName = config.database
        this.containerName = config.container
        this.database = this.client.database(config.database)
        this.container = this.database.container(config.container)
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
                    resultCount: 1
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
                    resultCount: 0
                })
                return null
            }

            trackGameEventStrict('SQL.Query.Failed', {
                operationName,
                latencyMs,
                httpStatusCode: cosmosError.code
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
                resultCount: 1
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
                httpStatusCode: cosmosError.code
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
                resultCount: 1
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
                httpStatusCode: cosmosError.code
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
                resultCount: 1
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
                httpStatusCode: cosmosError.code
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
                resultCount: 1
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
                    resultCount: 0
                })
                return false
            }

            trackGameEventStrict('SQL.Query.Failed', {
                operationName,
                latencyMs,
                httpStatusCode: cosmosError.code
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
                resultCount: results.length
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
                httpStatusCode: cosmosError.code
            })

            throw translateCosmosError(error, operationName)
        }
    }
}
