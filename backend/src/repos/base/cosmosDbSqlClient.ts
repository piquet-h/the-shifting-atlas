/**
 * Cosmos DB SQL API client interface and implementation.
 * Follows the same pattern as GremlinClient for dependency injection.
 *
 * This client wraps the @azure/cosmos SDK and provides container access
 * for repositories following the dual persistence architecture (ADR-002).
 */

import { CosmosClient, Database, Container } from '@azure/cosmos'
import { DefaultAzureCredential } from '@azure/identity'
import { inject, injectable } from 'inversify'

/**
 * Configuration for Cosmos SQL client
 */
export interface CosmosDbSqlClientConfig {
    endpoint: string
    database: string
    key?: string
}

/**
 * Interface for Cosmos DB SQL API client operations.
 * Provides container access for repository implementations.
 */
export interface ICosmosDbSqlClient {
    /**
     * Get a container instance for a specific container name
     * @param containerName - Name of the container (e.g., 'players', 'inventory')
     * @returns Container instance
     */
    getContainer(containerName: string): Container

    /**
     * Get the database instance
     * @returns Database instance
     */
    getDatabase(): Database
}

/**
 * Cosmos DB SQL API client implementation.
 * Uses Managed Identity (DefaultAzureCredential) for authentication.
 */
@injectable()
export class CosmosDbSqlClient implements ICosmosDbSqlClient {
    private client: CosmosClient
    private database: Database
    private databaseName: string

    constructor(@inject('CosmosDbSqlConfig') config: CosmosDbSqlClientConfig) {
        // Use Managed Identity (DefaultAzureCredential) for authentication unless key provided
        if (config.key) {
            this.client = new CosmosClient({ endpoint: config.endpoint, key: config.key })
        } else {
            const credential = new DefaultAzureCredential()
            this.client = new CosmosClient({ endpoint: config.endpoint, aadCredentials: credential })
        }

        this.databaseName = config.database
        this.database = this.client.database(config.database)
    }

    getContainer(containerName: string): Container {
        return this.database.container(containerName)
    }

    getDatabase(): Database {
        return this.database
    }
}
