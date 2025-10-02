/** Persistence configuration & mode resolution */
/* global process */

export type PersistenceMode = 'memory' | 'cosmos'

export interface PersistenceConfig {
    mode: PersistenceMode
    cosmos?: {
        endpoint: string
        database: string
        graph: string
        key?: string
    }
}

export function resolvePersistenceMode(): PersistenceMode {
    const m = (process.env.PERSISTENCE_MODE || 'memory').toLowerCase()
    return m === 'cosmos' ? 'cosmos' : 'memory'
}

export function loadPersistenceConfig(): PersistenceConfig {
    const mode = resolvePersistenceMode()
    if (mode === 'cosmos') {
        const endpoint = process.env.COSMOS_GREMLIN_ENDPOINT
        const database = process.env.COSMOS_GREMLIN_DATABASE
        const graph = process.env.COSMOS_GREMLIN_GRAPH
        const key = process.env.COSMOS_GREMLIN_KEY
        const strict = process.env.PERSISTENCE_STRICT === '1' || process.env.PERSISTENCE_STRICT === 'true'
        if (!endpoint || !database || !graph) {
            if (strict) {
                throw new Error('PERSISTENCE_STRICT enabled but Cosmos Gremlin configuration incomplete (endpoint/database/graph).')
            }
            // Fall back to memory if misconfigured (non-strict mode only)
            return { mode: 'memory' }
        }
        return { mode, cosmos: { endpoint, database, graph, key } }
    }
    return { mode: 'memory' }
}
