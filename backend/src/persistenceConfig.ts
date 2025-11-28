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
            deadLetters: string
            processedEvents: string
            exitHintDebounce: string
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
        // Accept legacy GREMLIN_* variables as fallback (backward compatibility with older deployments)
        const endpoint = process.env.COSMOS_GREMLIN_ENDPOINT || process.env.COSMOS_ENDPOINT || process.env.GREMLIN_ENDPOINT
        const database = process.env.COSMOS_GREMLIN_DATABASE || process.env.GREMLIN_DATABASE
        const graph = process.env.COSMOS_GREMLIN_GRAPH || process.env.GREMLIN_GRAPH
        const strict = process.env.PERSISTENCE_STRICT === '1' || process.env.PERSISTENCE_STRICT === 'true'

        // SQL API configuration
        const sqlEndpoint = process.env.COSMOS_SQL_ENDPOINT
        const sqlDatabase = process.env.COSMOS_SQL_DATABASE
        const sqlContainerPlayers = process.env.COSMOS_SQL_CONTAINER_PLAYERS
        const sqlContainerInventory = process.env.COSMOS_SQL_CONTAINER_INVENTORY
        const sqlContainerLayers = process.env.COSMOS_SQL_CONTAINER_LAYERS
        const sqlContainerEvents = process.env.COSMOS_SQL_CONTAINER_EVENTS
        const sqlContainerDeadLetters = process.env.COSMOS_SQL_CONTAINER_DEADLETTERS || 'deadLetters'
        const sqlContainerProcessedEvents = process.env.COSMOS_SQL_CONTAINER_PROCESSED_EVENTS || 'processedEvents'
        const sqlContainerExitHintDebounce = process.env.COSMOS_SQL_CONTAINER_EXIT_HINT_DEBOUNCE || 'exitHintDebounce'

        // Validate required Gremlin config
        if (!endpoint || !database || !graph) {
            if (strict) {
                const missingVars = []
                if (!endpoint) missingVars.push('COSMOS_GREMLIN_ENDPOINT or COSMOS_ENDPOINT')
                if (!database) missingVars.push('COSMOS_GREMLIN_DATABASE')
                if (!graph) missingVars.push('COSMOS_GREMLIN_GRAPH')

                throw new Error(
                    `PERSISTENCE_STRICT enabled but Cosmos Gremlin configuration incomplete. Missing: ${missingVars.join(', ')}`
                )
            }
            // Fall back to memory if misconfigured (non-strict mode only)
            return { mode: 'memory' }
        }

        // Validate SQL API config (authoritative player & event storage)
        if (!sqlEndpoint || !sqlDatabase || !sqlContainerPlayers || !sqlContainerInventory || !sqlContainerLayers || !sqlContainerEvents) {
            if (strict) {
                const missingVars = []
                if (!sqlEndpoint) missingVars.push('COSMOS_SQL_ENDPOINT')
                if (!sqlDatabase) missingVars.push('COSMOS_SQL_DATABASE')
                if (!sqlContainerPlayers) missingVars.push('COSMOS_SQL_CONTAINER_PLAYERS')
                if (!sqlContainerInventory) missingVars.push('COSMOS_SQL_CONTAINER_INVENTORY')
                if (!sqlContainerLayers) missingVars.push('COSMOS_SQL_CONTAINER_LAYERS')
                if (!sqlContainerEvents) missingVars.push('COSMOS_SQL_CONTAINER_EVENTS')

                throw new Error(
                    `PERSISTENCE_STRICT enabled but Cosmos SQL API configuration incomplete. Missing: ${missingVars.join(', ')}`
                )
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
            // Guardrail: If SQL endpoint equals Gremlin endpoint we assume accidental reuse of graph account
            // unless explicitly opted in via COSMOS_MULTI_MODEL_SINGLE_ACCOUNT=1. This misconfiguration surfaced
            // in production as RBAC 403 Substatus 5301 when the managed identity lacked data plane roles on the
            // graph account while the code attempted SQL container metadata reads (dead-letter repository init).
            const multiModelOptIn =
                process.env.COSMOS_MULTI_MODEL_SINGLE_ACCOUNT === '1' || process.env.COSMOS_MULTI_MODEL_SINGLE_ACCOUNT === 'true'
            if (!multiModelOptIn && sqlEndpoint.trim() === endpoint.trim()) {
                console.warn(
                    '[persistenceConfig] COSMOS_SQL_ENDPOINT equals COSMOS_GREMLIN_ENDPOINT. Assigning separate accounts is recommended. ' +
                        'If intentional (single multi-model account), set COSMOS_MULTI_MODEL_SINGLE_ACCOUNT=1 to suppress this warning.'
                )
            }
            config.cosmosSql = {
                endpoint: sqlEndpoint,
                database: sqlDatabase,
                containers: {
                    players: sqlContainerPlayers,
                    inventory: sqlContainerInventory,
                    layers: sqlContainerLayers,
                    events: sqlContainerEvents,
                    deadLetters: sqlContainerDeadLetters,
                    processedEvents: sqlContainerProcessedEvents,
                    exitHintDebounce: sqlContainerExitHintDebounce
                }
            }
        }

        return config
    }
    return { mode: 'memory' }
}
