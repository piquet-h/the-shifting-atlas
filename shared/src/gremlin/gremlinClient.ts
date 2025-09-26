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
        // Use unknown to keep type-safety without leaking 'any'.
        const gmod: unknown = gremlin
        const DriverRemoteConnection = (
            gmod as {
                driver: {
                    DriverRemoteConnection: new (url: string, opts: any) => any
                    auth: {PlainTextSaslAuthenticator: new (a: string, b: string | undefined) => any}
                }
            }
        ).driver.DriverRemoteConnection
        const Graph = (gmod as {structure: {Graph: new () => any}}).structure.Graph
        const authenticator = new (
            gmod as {driver: {auth: {PlainTextSaslAuthenticator: new (a: string, b: string | undefined) => any}}}
        ).driver.auth.PlainTextSaslAuthenticator(`/dbs/${config.database}/colls/${config.graph}`, config.key)
        const connection = new DriverRemoteConnection(`${config.endpoint}`, {
            authenticator,
            traversalsource: 'g'
        })
        const g = new Graph().traversal().withRemote(connection)
        return {
            async submit<T = unknown>(query: string, bindings?: Record<string, unknown>): Promise<T[]> {
                // Use connection underlying client (driver internal API). If gremlin changes, refactor accordingly.
                const internalConn: unknown = connection
                const raw = await (
                    internalConn as {_client: {submit: (q: string, b?: Record<string, unknown>) => Promise<{_items: T[]}>}}
                )._client.submit(query, bindings)
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
