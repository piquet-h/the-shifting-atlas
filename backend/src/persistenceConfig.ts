/** Persistence configuration & mode resolution */

export type PersistenceMode = 'memory' | 'cosmos'

export interface IPersistenceConfig {
    mode: PersistenceMode
    cosmos?: {
        endpoint: string
        database: string
        graph: string
        /** Gremlin authentication is now Azure AD (Managed Identity) only. */
    }
    cosmosSql?: {
        endpoint: string
        database: string
        containers: {
            players: string
            inventory: string
            layers: string
            events: string
        }
    }
}

export function resolvePersistenceMode(): PersistenceMode {
    const m = (process.env.PERSISTENCE_MODE || 'memory').toLowerCase()
    return m === 'cosmos' ? 'cosmos' : 'memory'
}

/**
 * Load persistence configuration asynchronously, fetching secrets from Key Vault via managed identity
 * Falls back to environment variables for local development
 */
export async function loadPersistenceConfigAsync(): Promise<IPersistenceConfig> {
    const mode = resolvePersistenceMode()
    if (mode === 'cosmos') {
        const endpoint = process.env.COSMOS_GREMLIN_ENDPOINT || process.env.COSMOS_ENDPOINT
        const database = process.env.COSMOS_GREMLIN_DATABASE
        const graph = process.env.COSMOS_GREMLIN_GRAPH
        const strict = process.env.PERSISTENCE_STRICT === '1' || process.env.PERSISTENCE_STRICT === 'true'

        // SQL API configuration
        const sqlEndpoint = process.env.COSMOS_SQL_ENDPOINT
        const sqlDatabase = process.env.COSMOS_SQL_DATABASE
        const sqlContainerPlayers = process.env.COSMOS_SQL_CONTAINER_PLAYERS
        const sqlContainerInventory = process.env.COSMOS_SQL_CONTAINER_INVENTORY
        const sqlContainerLayers = process.env.COSMOS_SQL_CONTAINER_LAYERS
        const sqlContainerEvents = process.env.COSMOS_SQL_CONTAINER_EVENTS

        // Validate required Gremlin config
        if (!endpoint || !database || !graph) {
            if (strict) {
                throw new Error('PERSISTENCE_STRICT enabled but Cosmos Gremlin configuration incomplete (endpoint/database/graph).')
            }
            // Fall back to memory if misconfigured (non-strict mode only)
            return { mode: 'memory' }
        }

        // Validate SQL API config (required for dual persistence)
        if (!sqlEndpoint || !sqlDatabase || !sqlContainerPlayers || !sqlContainerInventory || !sqlContainerLayers || !sqlContainerEvents) {
            if (strict) {
                throw new Error('PERSISTENCE_STRICT enabled but Cosmos SQL API configuration incomplete (endpoint/database/containers).')
            }
            // Log warning but continue (SQL API might not be used yet in all code paths)
            console.warn('Cosmos SQL API configuration incomplete. Some features may not be available.')
        }

        const config: IPersistenceConfig = {
            mode,
            cosmos: { endpoint, database, graph }
        }

        // Add SQL config if all required vars are present
        if (sqlEndpoint && sqlDatabase && sqlContainerPlayers && sqlContainerInventory && sqlContainerLayers && sqlContainerEvents) {
            config.cosmosSql = {
                endpoint: sqlEndpoint,
                database: sqlDatabase,
                containers: {
                    players: sqlContainerPlayers,
                    inventory: sqlContainerInventory,
                    layers: sqlContainerLayers,
                    events: sqlContainerEvents
                }
            }
        }

        return config
    }
    return { mode: 'memory' }
}
