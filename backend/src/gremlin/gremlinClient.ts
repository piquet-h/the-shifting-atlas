import { DefaultAzureCredential } from '@azure/identity'
import gremlin from 'gremlin'
import { inject, injectable } from 'inversify'
import 'reflect-metadata'

// Gremlin is CommonJS, extract what we need
const driver = gremlin.driver
type DriverRemoteConnection = InstanceType<typeof driver.DriverRemoteConnection>
type PlainTextSaslAuthenticator = InstanceType<typeof driver.auth.PlainTextSaslAuthenticator>

export interface GremlinClientConfig {
    endpoint: string
    database: string
    graph: string
}

/**
 * Interface for executing Gremlin queries against Cosmos DB Gremlin API.
 * Automatically handles Azure AD authentication and connection management.
 */
export interface IGremlinClient {
    /**
     * Submits a Gremlin query and returns the results.
     * @param query - The Gremlin query string to execute
     * @param bindings - Optional parameter bindings for the query
     * @returns Array of query results
     */
    submit<T = unknown>(query: string, bindings?: Record<string, unknown>): Promise<T[]>

    /**
     * Closes the Gremlin connection.
     * Should be called during cleanup to properly release resources.
     */
    close(): Promise<void>
}

/**
 * Internal structure of the Gremlin driver's remote connection.
 * The public types don't expose _client, but we need it for query submission.
 */
interface GremlinInternalClient<T = unknown> {
    _client: {
        submit: (query: string, bindings?: Record<string, unknown>) => Promise<{ _items: T[] }>
    }
}

@injectable()
export class GremlinClient implements IGremlinClient {
    private connection: DriverRemoteConnection | undefined

    constructor(@inject('GremlinConfig') private config: GremlinClientConfig) {}

    async submit<T = unknown>(query: string, bindings?: Record<string, unknown>): Promise<T[]> {
        if (!this.connection) {
            await this.initialize()
        }

        // Access the internal _client that's not exposed in the public type definitions
        const internalClient = this.connection as unknown as GremlinInternalClient<T>
        const raw = await internalClient._client.submit(query, bindings)
        return raw._items
    }

    async close(): Promise<void> {
        if (this.connection) {
            try {
                await this.connection.close()
            } catch (error) {
                // Log but don't throw - cleanup should be best-effort
                console.warn('Error closing Gremlin connection:', error)
            }
            this.connection = undefined
        }
    }

    private async initialize(): Promise<void> {
        const token = await this.getAzureADToken()
        const authenticator = this.createAuthenticator(token)
        const wsEndpoint = this.convertToWebSocketEndpoint(this.config.endpoint)

        this.connection = new driver.DriverRemoteConnection(wsEndpoint, {
            authenticator,
            traversalsource: 'g',
            mimeType: 'application/vnd.gremlin-v2.0+json' // Azure Cosmos DB requires GraphSON v2
        })
    }

    private async getAzureADToken(): Promise<string> {
        const credential = new DefaultAzureCredential()
        const scope = 'https://cosmos.azure.com/.default'
        const token = await credential.getToken(scope)

        if (!token?.token) {
            throw new Error('Failed to acquire Azure AD token for Cosmos DB Gremlin API. Ensure Managed Identity is configured.')
        }

        return token.token
    }

    private createAuthenticator(token: string): PlainTextSaslAuthenticator {
        const resourcePath = `/dbs/${this.config.database}/colls/${this.config.graph}`
        return new driver.auth.PlainTextSaslAuthenticator(resourcePath, token)
    }

    /**
     * Converts an HTTPS Cosmos DB endpoint to the WebSocket format required by Gremlin.
     * Example: https://account.documents.azure.com -> wss://account.gremlin.cosmos.azure.com
     */
    private convertToWebSocketEndpoint(endpoint: string): string {
        if (endpoint.startsWith('https://')) {
            return endpoint.replace('https://', 'wss://').replace('.documents.azure.com', '.gremlin.cosmos.azure.com')
        }
        return endpoint
    }
}

/**
 * Factory function for creating GremlinClient instances (legacy compatibility).
 * @deprecated Use InversifyJS container to inject IGremlinClient instead.
 * This factory exists for backward compatibility with code not yet migrated to DI.
 */
export async function createGremlinClient(config: GremlinClientConfig): Promise<IGremlinClient> {
    const client = new GremlinClient(config)
    // Initialize the connection eagerly to ensure it's ready
    await client.submit('g.V().limit(1)')
    return client
}
