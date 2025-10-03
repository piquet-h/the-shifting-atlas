/**
 * Example: Using the Secret Management Helper
 * 
 * This example demonstrates how to use the secret management helper
 * to fetch secrets securely from Azure Key Vault with Managed Identity.
 */

import { getSecret, clearSecretCache, getSecretCacheStats, loadPersistenceConfigAsync, createGremlinClient } from '@atlas/shared'

/**
 * Example 1: Basic secret retrieval
 */
async function example1_BasicRetrieval() {
    try {
        // Fetch Cosmos DB key
        // In production: fetches from Key Vault using Managed Identity
        // In development: falls back to COSMOS_GREMLIN_KEY env var
        const cosmosKey = await getSecret('cosmos-primary-key')
        
        console.log('Successfully retrieved Cosmos key')
        // Use cosmosKey to connect to Cosmos DB...
    } catch (error) {
        console.error('Failed to retrieve secret:', error)
    }
}

/**
 * Example 2: Multiple secrets
 */
async function example2_MultipleSecrets() {
    try {
        // Fetch multiple secrets in parallel
        const [cosmosKey, sqlKey] = await Promise.all([
            getSecret('cosmos-primary-key'),
            getSecret('cosmos-sql-primary-key')
        ])
        
        console.log('Retrieved both Cosmos keys successfully')
        
        // Second fetch will use cached values (5-minute TTL)
        const cosmosKeyAgain = await getSecret('cosmos-primary-key')
        
        // Check cache stats
        const stats = getSecretCacheStats()
        console.log(`Cache size: ${stats.size}, keys: ${stats.keys.join(', ')}`)
    } catch (error) {
        console.error('Failed to retrieve secrets:', error)
    }
}

/**
 * Example 3: Custom retry options
 */
async function example3_CustomOptions() {
    try {
        // Customize retry behavior and cache TTL
        const secret = await getSecret('service-bus-connection-string', {
            maxRetries: 5,              // Try up to 5 times
            initialRetryDelayMs: 2000,  // Start with 2s delay
            cacheTtlMs: 10 * 60 * 1000  // Cache for 10 minutes
        })
        
        console.log('Retrieved Service Bus connection string')
    } catch (error) {
        console.error('Failed after retries:', error)
    }
}

/**
 * Example 4: Cache management
 */
async function example4_CacheManagement() {
    // Fetch a secret
    await getSecret('cosmos-primary-key')
    
    console.log('Before clear:', getSecretCacheStats())
    
    // Clear cache to force fresh fetch
    clearSecretCache()
    
    console.log('After clear:', getSecretCacheStats())
    
    // Next fetch will hit Key Vault again
    await getSecret('cosmos-primary-key')
}

/**
 * Example 5: Using with persistence config
 */
async function example5_PersistenceConfig() {
    try {
        // Load config with secrets from Key Vault
        const config = await loadPersistenceConfigAsync()
        
        if (config.mode === 'cosmos' && config.cosmos) {
            // Create Gremlin client with fetched credentials
            const client = await createGremlinClient(config.cosmos)
            console.log('Gremlin client ready')
        }
    } catch (error) {
        console.error('Failed to initialize persistence:', error)
    }
}

/**
 * Example 6: Error handling
 */
async function example6_ErrorHandling() {
    try {
        // This will fail - not in allowlist
        await getSecret('invalid-secret-key')
    } catch (error) {
        console.error('Expected error:', (error as Error).message)
        // Error: Secret key "invalid-secret-key" is not in allowlist
    }
    
    try {
        // This will fail if Key Vault not configured and no local env var
        await getSecret('signing-secret')
    } catch (error) {
        console.error('Secret not found:', (error as Error).message)
        // Error: Secret signing-secret not found. Configure KEYVAULT_NAME...
    }
}

// Run examples (uncomment to test)
// example1_BasicRetrieval()
// example2_MultipleSecrets()
// example3_CustomOptions()
// example4_CacheManagement()
// example5_PersistenceConfig()
// example6_ErrorHandling()
