/* eslint-disable */
/**
 * Example: Using the Secret Management Helper
 *
 * This example demonstrates how to use the secret management helper
 * to fetch secrets securely from Azure Key Vault with Managed Identity.
 */

import { clearSecretCache, getSecret, getSecretCacheStats } from '@atlas/shared'
import console from 'node:console'

// Cosmos DB keys now sourced via Managed Identity (SQL) or direct env var (Gremlin) – no secret retrieval examples needed.

/**
 * Example 3: Custom retry options
 */
async function example3_CustomOptions() {
    try {
        // Customize retry behavior and cache TTL
        const secret = await getSecret('service-bus-connection-string', {
            maxRetries: 5, // Try up to 5 times
            initialRetryDelayMs: 2000, // Start with 2s delay
            cacheTtlMs: 10 * 60 * 1000 // Cache for 10 minutes
        })

        console.log('Retrieved Service Bus connection string')
    } catch (error) {
        console.error('Failed after retries:', error)
    }
}

// Cache management still works for remaining secrets
async function example4_CacheManagement() {
    await getSecret('service-bus-connection-string').catch(() => {})
    console.log('Before clear:', getSecretCacheStats())
    clearSecretCache()
    console.log('After clear:', getSecretCacheStats())
}

// Persistence config no longer pulls Cosmos keys from Key Vault – Gremlin key must be in env for now.

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
// example3_CustomOptions()
// example4_CacheManagement()
// example6_ErrorHandling()
