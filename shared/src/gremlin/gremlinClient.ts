/** Lightweight Gremlin client abstraction so shared code does not hard depend on the gremlin driver until cosmos mode is enabled. */

export interface GremlinClientConfig {
    endpoint: string
    database: string
    graph: string
    key?: string
}

export interface GremlinClient {
    submit<T = unknown>(query: string, bindings?: Record<string, unknown>): Promise<T[]>
}

/** Dynamic factory. Only loads the real gremlin driver when available; otherwise throws if cosmos mode is requested. */
export async function createGremlinClient(config: GremlinClientConfig): Promise<GremlinClient> {
    try {
        // Dynamic import keeps dev install light when only using memory mode.
        const gremlin = await import('gremlin')
        /**
         * Internal lightweight facades below intentionally mirror only the tiny slice of the Gremlin
         * driver surface we use. Rationale:
         *  - Avoid pulling full gremlin types into consuming (especially frontend) bundles when
         *    cosmos mode is not enabled (tree‑shaking friendliness + smaller install surface).
         *  - Preserve an optional / dynamic boundary so packages that never touch Cosmos Gremlin
         *    don’t acquire an unnecessary hard dependency.
         *  - Minimize blast radius if the upstream driver’s internal structures change; we adapt
         *    a single narrow shim instead of propagating types across the codebase.
         * If new capabilities are required, extend these minimal interfaces rather than importing
         * external driver types directly.
         */
        // Minimal internal type surface to avoid explicit any & keep optional dependency boundary small.
        type InternalRemoteResult<T = unknown> = { _items: T[] }
        interface InternalRemoteClient {
            submit<T = unknown>(q: string, b?: Record<string, unknown>): Promise<InternalRemoteResult<T>>
        }
        interface DriverRemoteConnectionLike {
            _client: InternalRemoteClient
        }
        type DriverRemoteConnectionCtor = new (
            url: string,
            opts: { authenticator: unknown; traversalsource: string }
        ) => DriverRemoteConnectionLike
        interface GremlinModuleShape {
            driver: {
                DriverRemoteConnection: DriverRemoteConnectionCtor
                auth: { PlainTextSaslAuthenticator: new (a: string, b: string | undefined) => unknown }
            }
        }
        const gmod = gremlin as unknown as GremlinModuleShape
        const DriverRemoteConnection = gmod.driver.DriverRemoteConnection
        const authenticator = new gmod.driver.auth.PlainTextSaslAuthenticator(`/dbs/${config.database}/colls/${config.graph}`, config.key)
        const connection: DriverRemoteConnectionLike = new DriverRemoteConnection(`${config.endpoint}`, {
            authenticator,
            traversalsource: 'g'
        })
        return {
            async submit<T = unknown>(query: string, bindings?: Record<string, unknown>): Promise<T[]> {
                // Use underlying internal client. If gremlin driver internal API changes, adjust here.
                const raw = await connection._client.submit<T>(query, bindings)
                return raw._items
            }
        }
    } catch (err) {
        throw new Error(
            'Gremlin driver not available or failed to initialize. Install "gremlin" and ensure Cosmos DB Gremlin endpoint env vars are set. Original error: ' +
                (err as Error).message
        )
    }
}
