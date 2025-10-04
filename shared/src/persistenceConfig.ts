/** Persistence configuration & mode resolution */

import type { AllowedSecretKey } from './secrets/secretsHelper.js'

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

/**
 * Load persistence configuration (synchronous, for backwards compatibility)
 * Note: This function reads the key from environment variables for local dev.
 * For production, use loadPersistenceConfigAsync which fetches from Key Vault.
 * @deprecated Use loadPersistenceConfigAsync for production workloads
 */
// Deprecated synchronous loader removed (previously loadPersistenceConfig). All code paths
// should migrate to the async variant below which sources secrets via Key Vault helper.
/**
 * Load persistence configuration asynchronously, fetching secrets from Key Vault via managed identity
 * Falls back to environment variables for local development
 */
export async function loadPersistenceConfigAsync(): Promise<PersistenceConfig> {
    const mode = resolvePersistenceMode()
    if (mode === 'cosmos') {
        const endpoint = process.env.COSMOS_GREMLIN_ENDPOINT || process.env.COSMOS_ENDPOINT
        const database = process.env.COSMOS_GREMLIN_DATABASE
        const graph = process.env.COSMOS_GREMLIN_GRAPH
        const strict = process.env.PERSISTENCE_STRICT === '1' || process.env.PERSISTENCE_STRICT === 'true'
        // Validate required config
        if (!endpoint || !database || !graph) {
            if (strict) {
                throw new Error('PERSISTENCE_STRICT enabled but Cosmos Gremlin configuration incomplete (endpoint/database/graph).')
            }
            // Fall back to memory if misconfigured (non-strict mode only)
            return { mode: 'memory' }
        }
        // Dynamic import to avoid circular dependencies & keep browser bundle slim. Let errors surface.
        const { getSecret } = await import('./secrets/secretsHelper.js')
        const key = await getSecret('cosmos-primary-key' as AllowedSecretKey)
        return { mode, cosmos: { endpoint, database, graph, key } }
    }
    return { mode: 'memory' }
}
