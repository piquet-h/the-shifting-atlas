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
 * Result metadata from a Gremlin query execution.
 * Includes performance metrics for observability (ADR-002 partition monitoring).
 */
export interface GremlinQueryResult<T = unknown> {
    /** Query result items */
    items: T[]
    /** Execution time in milliseconds */
    latencyMs: number
    /** Request charge in Request Units (RU), if available from Cosmos DB */
    requestCharge?: number
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
     * Submits a Gremlin query with telemetry metadata.
     * @param query - The Gremlin query string to execute
     * @param bindings - Optional parameter bindings for the query
     * @returns Query result with performance metadata
     */
    submitWithMetrics<T = unknown>(query: string, bindings?: Record<string, unknown>): Promise<GremlinQueryResult<T>>

    /**
     * Closes the Gremlin connection.
     * Should be called during cleanup to properly release resources.
     */
    close(): Promise<void>
}

/**
 * Internal structure of the Gremlin driver's remote connection.
 * The public types don't expose _client, but we need it for query submission.
 * Cosmos DB Gremlin API returns response attributes including request charge.
 */
interface GremlinInternalClient<T = unknown> {
    _client: {
        submit: (
            query: string,
            bindings?: Record<string, unknown>
        ) => Promise<{
            _items: T[]
            attributes?: Map<string, unknown> | Record<string, unknown>
        }>
    }
}

@injectable()
export class GremlinClient implements IGremlinClient {
    private connection: DriverRemoteConnection | undefined

    constructor(@inject('GremlinConfig') private config: GremlinClientConfig) {}

    async submit<T = unknown>(query: string, bindings?: Record<string, unknown>): Promise<T[]> {
        const result = await this.submitWithMetrics<T>(query, bindings)
        return result.items
    }

    async submitWithMetrics<T = unknown>(query: string, bindings?: Record<string, unknown>): Promise<GremlinQueryResult<T>> {
        if (!this.connection) {
            await this.initialize()
        }

        const startTime = Date.now()
        let requestCharge: number | undefined

        try {
            // Access the internal _client that's not exposed in the public type definitions
            const internalClient = this.connection as unknown as GremlinInternalClient<T>
            const raw = await internalClient._client.submit(query, bindings)

            // Extract request charge from response attributes if available
            // Cosmos DB Gremlin API returns this in the response attributes
            if (raw.attributes) {
                try {
                    // Attributes can be a Map or plain object depending on driver version
                    const attrs = raw.attributes instanceof Map ? Object.fromEntries(raw.attributes) : raw.attributes
                    // Common attribute keys: 'x-ms-request-charge', 'requestCharge'
                    requestCharge =
                        (attrs['x-ms-request-charge'] as number) ||
                        (attrs['requestCharge'] as number) ||
                        (attrs['x-ms-total-request-charge'] as number)
                } catch {
                    // Silently ignore attribute parsing errors
                }
            }

            return {
                items: raw._items,
                latencyMs: Date.now() - startTime,
                requestCharge
            }
        } catch (error) {
            throw error
        }
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
        const trimmed = (this.config.endpoint || '').trim()
        if (!trimmed) {
            throw new Error(
                'Gremlin endpoint is empty or whitespace. Set COSMOS_GREMLIN_ENDPOINT (preferred) or COSMOS_ENDPOINT. Example: https://your-account.documents.azure.com:443/'
            )
        }
        const wsEndpoint = validateGremlinEndpoint(trimmed)

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

/**
 * Validates and converts a Cosmos DB account HTTPS endpoint to a Gremlin WebSocket endpoint.
 * Throws a descriptive error if the endpoint is clearly invalid.
 */
export function validateGremlinEndpoint(endpoint: string): string {
    const value = endpoint.trim()
    if (!value) {
        throw new Error('Gremlin endpoint empty after trim.')
    }
    if (!/^https:\/\//.test(value)) {
        throw new Error('Gremlin endpoint must start with https:// (Cosmos DB account endpoint). Received: ' + value)
    }
    if (!value.includes('.documents.azure.com')) {
        // Accept if already gremlin form
        if (value.includes('.gremlin.cosmos.azure.com')) return value.replace('https://', 'wss://')
        throw new Error('Unexpected Cosmos endpoint format. Expected host ending in .documents.azure.com')
    }
    // Convert
    const ws = value.replace('https://', 'wss://').replace('.documents.azure.com', '.gremlin.cosmos.azure.com')
    return ws
}
