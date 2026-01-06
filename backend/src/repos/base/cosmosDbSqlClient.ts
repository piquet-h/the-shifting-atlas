/**
 * Cosmos DB SQL API client interface and implementation.
 * Follows the same pattern as GremlinClient for dependency injection.
 *
 * This client wraps the @azure/cosmos SDK and provides container access
 * for repositories following the dual persistence architecture (ADR-002).
 */

import { Container, CosmosClient, Database } from '@azure/cosmos'
import { DefaultAzureCredential } from '@azure/identity'
import { inject, injectable } from 'inversify'

/**
 * Configuration for Cosmos SQL client
 */
export interface CosmosDbSqlClientConfig {
    endpoint: string
    database: string
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
        // Azure AD only (Managed Identity in Azure, developer identity locally via DefaultAzureCredential)
        // Reject legacy key-based auth explicitly so local dev stays aligned with production.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const legacyKey = (config as any).key
        if (legacyKey) {
            throw new Error(
                'Cosmos SQL key authentication is not supported. Use Azure AD (DefaultAzureCredential) and assign Cosmos DB data-plane RBAC roles.'
            )
        }

        const credential = new DefaultAzureCredential()
        this.client = new CosmosClient({ endpoint: config.endpoint, aadCredentials: credential })

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
