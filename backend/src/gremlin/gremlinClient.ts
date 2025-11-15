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
    /** Timeout for individual operations in milliseconds (default: 30000) */
    operationTimeoutMs?: number
    /** Timeout for WebSocket connection in milliseconds (default: 10000) */
    connectionTimeoutMs?: number
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

    /**
     * Tests connectivity to Cosmos DB Gremlin API.
     * Returns true if connection succeeds, false otherwise.
     * Useful for pre-flight checks before running operations.
     */
    healthCheck(): Promise<boolean>
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
    private readonly operationTimeoutMs: number
    private readonly connectionTimeoutMs: number

    constructor(@inject('GremlinConfig') private config: GremlinClientConfig) {
        this.operationTimeoutMs = config.operationTimeoutMs ?? 30000
        this.connectionTimeoutMs = config.connectionTimeoutMs ?? 10000
    }

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

            // Wrap the query execution with a timeout to prevent indefinite hangs
            const raw = await this.withTimeout(
                internalClient._client.submit(query, bindings),
                this.operationTimeoutMs,
                'Gremlin query execution'
            )

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
            // Improve diagnostic clarity for missing Cosmos RBAC (Forbidden Substatus 5301)
            if (error instanceof Error) {
                const msg = error.message || ''
                // Substatus 5301 = principal lacks "Microsoft.DocumentDB/databaseAccounts/readMetadata" action
                if (/Substatus:\s*5301/.test(msg) || /does not have required RBAC permissions/.test(msg)) {
                    const guidance =
                        'Cosmos Gremlin RBAC misconfiguration: the managed identity or AAD principal lacks a data role. Assign "Cosmos DB Built-in Data Contributor" (or at minimum Data Reader for read-only) at the account scope "/" to principal GUID shown in the original error. See https://aka.ms/cosmos-native-rbac.'
                    // Re-wrap original error without leaking auth header/token contents
                    throw new Error(guidance + ' Original: ' + sanitizeCosmosError(msg))
                }
            }
            throw error
        }
    }

    async close(): Promise<void> {
        if (this.connection) {
            try {
                // Close with timeout to prevent hanging on cleanup
                await this.withTimeout(this.connection.close(), 5000, 'Gremlin connection close')
            } catch (error) {
                // Log but don't throw - cleanup should be best-effort
                console.warn('Error closing Gremlin connection:', error)
            }
            this.connection = undefined
        }
    }

    async healthCheck(): Promise<boolean> {
        try {
            console.log('[GremlinClient] Running health check...')
            await this.submit('g.V().limit(1)')
            console.log('[GremlinClient] Health check passed')
            return true
        } catch (error) {
            console.error('[GremlinClient] Health check failed:', error instanceof Error ? error.message : String(error))
            return false
        }
    }

    private async initialize(): Promise<void> {
        console.log('[GremlinClient] Initializing connection...')

        const token = await this.withTimeout(this.getAzureADToken(), this.connectionTimeoutMs, 'Azure AD token acquisition')

        console.log('[GremlinClient] Azure AD token acquired successfully')

        const authenticator = this.createAuthenticator(token)
        const trimmed = (this.config.endpoint || '').trim()
        if (!trimmed) {
            throw new Error(
                'Gremlin endpoint is empty or whitespace. Set COSMOS_GREMLIN_ENDPOINT (preferred) or COSMOS_ENDPOINT. Example: https://your-account.documents.azure.com:443/'
            )
        }
        const wsEndpoint = validateGremlinEndpoint(trimmed)

        console.log(`[GremlinClient] Connecting to ${wsEndpoint.split('.')[0]}...`)

        this.connection = new driver.DriverRemoteConnection(wsEndpoint, {
            authenticator,
            traversalsource: 'g',
            mimeType: 'application/vnd.gremlin-v2.0+json', // Azure Cosmos DB requires GraphSON v2
            connectOnStartup: true,
            // Connection pool settings for better reliability
            maxContentLength: 10485760, // 10MB
            maxIdleTime: 900000, // 15 minutes
            maxReconnectAttempts: 3,
            reconnectInterval: 1000,
            // Force use of the ws package instead of global WebSocket (Node.js environment)
            // This prevents compatibility issues with browser WebSocket polyfills
            rejectUnauthorized: true // ws-specific option to force ws package usage
        })

        console.log('[GremlinClient] Connection established')
    }

    private async getAzureADToken(): Promise<string> {
        console.log('[GremlinClient] Acquiring Azure AD token...')
        const credential = new DefaultAzureCredential()
        const scope = 'https://cosmos.azure.com/.default'

        try {
            const token = await credential.getToken(scope)

            if (!token?.token) {
                throw new Error(
                    'Failed to acquire Azure AD token for Cosmos DB Gremlin API. Ensure Managed Identity or OIDC is configured.'
                )
            }

            console.log(`[GremlinClient] Token acquired (expires: ${new Date(token.expiresOnTimestamp).toISOString()})`)
            return token.token
        } catch (error) {
            console.error('[GremlinClient] Token acquisition failed:', error instanceof Error ? error.message : String(error))
            throw new Error(
                `Azure AD authentication failed: ${error instanceof Error ? error.message : String(error)}. ` +
                    'Verify AZURE_CLIENT_ID, AZURE_TENANT_ID, and AZURE_SUBSCRIPTION_ID are set for OIDC, or Managed Identity is enabled.'
            )
        }
    }

    private createAuthenticator(token: string): PlainTextSaslAuthenticator {
        const resourcePath = `/dbs/${this.config.database}/colls/${this.config.graph}`
        return new driver.auth.PlainTextSaslAuthenticator(resourcePath, token)
    }

    /**
     * Wraps a promise with a timeout to prevent indefinite hangs.
     * Throws a timeout error if the operation exceeds the specified time limit.
     */
    private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
        let timeoutHandle: NodeJS.Timeout

        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
                reject(new Error(`${operationName} timed out after ${timeoutMs}ms`))
            }, timeoutMs)
        })

        try {
            const result = await Promise.race([promise, timeoutPromise])
            clearTimeout(timeoutHandle!)
            return result
        } catch (error) {
            clearTimeout(timeoutHandle!)
            throw error
        }
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

/**
 * Remove potentially sensitive header detail from a Cosmos SDK error string while retaining core diagnostics.
 */
function sanitizeCosmosError(message: string): string {
    // Drop Authorization length details and any bearer token fragments if present.
    return message
        .replace(/Authorization Length: \d+/g, 'Authorization Length: [redacted]')
        .replace(/"Authorization"\s*:\s*"[^"]+"/g, '"Authorization":"[redacted]"')
}
