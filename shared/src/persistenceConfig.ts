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
        if (!endpoint || !database || !graph) {
            // Fall back to memory if misconfigured (safer than throwing inside Function cold start)
            return {mode: 'memory'}
        }
        return {mode, cosmos: {endpoint, database, graph, key}}
    }
    return {mode: 'memory'}
}
