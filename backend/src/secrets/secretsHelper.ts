/** Secret retrieval helper with lazy caching, retry logic, and telemetry */

import { DefaultAzureCredential } from '@azure/identity'
import { SecretClient } from '@azure/keyvault-secrets'
import type { TelemetryService } from '../telemetry/TelemetryService.js'

/** Allowlisted secret keys that can be retrieved */
export const ALLOWED_SECRET_KEYS = [
    // Cosmos keys removed – managed identity now used for SQL API; Gremlin key sourced via env var only.
    'service-bus-connection-string',
    'model-provider-api-key',
    'signing-secret'
] as const

export type AllowedSecretKey = (typeof ALLOWED_SECRET_KEYS)[number]

interface CachedSecret {
    value: string
    fetchedAt: number
}

interface SecretFetchOptions {
    /** Maximum retry attempts (default: 3) */
    maxRetries?: number
    /** Initial retry delay in ms (default: 1000) */
    initialRetryDelayMs?: number
    /** Cache TTL in ms (default: 5 minutes) */
    cacheTtlMs?: number
    /** Optional telemetry service for emitting secret fetch events */
    telemetryService?: TelemetryService
}

const DEFAULT_OPTIONS: Required<Omit<SecretFetchOptions, 'telemetryService'>> = {
    maxRetries: 3,
    initialRetryDelayMs: 1000,
    cacheTtlMs: 5 * 60 * 1000 // 5 minutes
}

/** In-memory cache for secrets */
const secretCache = new Map<string, CachedSecret>()

/** Lazy-initialized Secret Client */
let secretClient: SecretClient | null = null

/**
 * Get or create the Secret Client using Managed Identity (DefaultAzureCredential)
 * Falls back to local environment variables when Key Vault is not available
 */
function getSecretClient(): SecretClient | null {
    // Check if running in production environment (Key Vault available)
    const keyVaultName = process.env.KEYVAULT_NAME
    if (!keyVaultName) {
        // Local development mode - no Key Vault
        return null
    }

    if (!secretClient) {
        const vaultUrl = `https://${keyVaultName}.vault.azure.net`
        const credential = new DefaultAzureCredential()
        secretClient = new SecretClient(vaultUrl, credential)
    }

    return secretClient
}

/**
 * Validate that the secret key is in the allowlist
 */
function validateSecretKey(key: string): asserts key is AllowedSecretKey {
    if (!(ALLOWED_SECRET_KEYS as readonly string[]).includes(key)) {
        throw new Error(`Secret key "${key}" is not in allowlist. Allowed keys: ${ALLOWED_SECRET_KEYS.join(', ')}`)
    }
}

/**
 * Sleep for a given duration (for retry backoff)
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Get local development fallback for a secret
 */
function getLocalFallback(secretKey: AllowedSecretKey): string | undefined {
    // Map secret keys to environment variable names
    const envVarMap: Record<AllowedSecretKey, string> = {
        'service-bus-connection-string': 'SERVICE_BUS_CONNECTION_STRING',
        'model-provider-api-key': 'MODEL_PROVIDER_API_KEY',
        'signing-secret': 'SIGNING_SECRET'
    }

    const envVarName = envVarMap[secretKey]
    const value = process.env[envVarName]

    // Guard against using local fallback in production
    const nodeEnv = process.env.NODE_ENV || 'development'
    if (value && nodeEnv === 'production') {
        throw new Error(`Refusing to use local environment variable ${envVarName} in production. Configure Key Vault properly.`)
    }

    return value
}

/**
 * Fetch a secret from Key Vault with retry and backoff
 */
async function fetchSecretWithRetry(
    client: SecretClient,
    secretKey: AllowedSecretKey,
    options: Required<Omit<SecretFetchOptions, 'telemetryService'>> & { telemetryService?: TelemetryService }
): Promise<string> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
        try {
            const secret = await client.getSecret(secretKey)
            if (!secret.value) {
                throw new Error(`Secret ${secretKey} exists but has no value`)
            }
            return secret.value
        } catch (err) {
            lastError = err as Error

            // Don't retry on the last attempt
            if (attempt < options.maxRetries) {
                const delayMs = options.initialRetryDelayMs * Math.pow(2, attempt)
                if (options.telemetryService) {
                    options.telemetryService.trackGameEvent('Secret.Fetch.Retry', {
                        secretKey,
                        attempt,
                        delayMs,
                        error: lastError.message
                    })
                }
                await sleep(delayMs)
            }
        }
    }

    throw new Error(
        `Failed to fetch secret ${secretKey} after ${options.maxRetries + 1} attempts: ${lastError?.message || 'unknown error'}`
    )
}

/**
 * Get a secret value with caching, retry, and telemetry
 *
 * @param secretKey - The secret key from the allowlist
 * @param options - Fetch options (retry, cache TTL)
 * @returns The secret value
 * @throws Error if secret key is not allowlisted or fetch fails
 *
 * In production: fetches from Azure Key Vault using Managed Identity
 * In development: falls back to environment variables (e.g., from .env.development)
 */
export async function getSecret(secretKey: string, options: SecretFetchOptions = {}): Promise<string> {
    // Validate allowlist
    validateSecretKey(secretKey)

    const opts = { ...DEFAULT_OPTIONS, ...options }
    const now = Date.now()

    // Check cache
    const cached = secretCache.get(secretKey)
    if (cached && now - cached.fetchedAt < opts.cacheTtlMs) {
        if (opts.telemetryService) {
            opts.telemetryService.trackGameEvent('Secret.Cache.Hit', { secretKey })
        }
        return cached.value
    }

    if (opts.telemetryService) {
        opts.telemetryService.trackGameEvent('Secret.Cache.Miss', { secretKey })
    }

    // Try Key Vault first
    const client = getSecretClient()

    if (client) {
        try {
            const value = await fetchSecretWithRetry(client, secretKey, opts)

            // Update cache
            secretCache.set(secretKey, { value, fetchedAt: now })

            if (opts.telemetryService) {
                opts.telemetryService.trackGameEvent('Secret.Fetch.Success', { secretKey, source: 'keyvault' })
            }
            return value
        } catch (err) {
            if (opts.telemetryService) {
                opts.telemetryService.trackGameEvent('Secret.Fetch.Failure', {
                    secretKey,
                    source: 'keyvault',
                    error: (err as Error).message
                })
            }

            // Try local fallback
            const fallback = getLocalFallback(secretKey)
            if (fallback) {
                if (opts.telemetryService) {
                    opts.telemetryService.trackGameEvent('Secret.Fetch.Fallback', { secretKey, source: 'env' })
                }
                // Don't cache fallback values (they might change during development)
                return fallback
            }

            throw err
        }
    }

    // Local development mode - use environment variables
    const localValue = getLocalFallback(secretKey)
    if (localValue) {
        if (opts.telemetryService) {
            opts.telemetryService.trackGameEvent('Secret.Fetch.Success', { secretKey, source: 'local-env' })
        }
        return localValue
    }

    if (opts.telemetryService) {
        opts.telemetryService.trackGameEvent('Secret.Fetch.Failure', {
            secretKey,
            source: 'none',
            error: 'No Key Vault configured and no local fallback found'
        })
    }

    throw new Error(`Secret ${secretKey} not found. Configure KEYVAULT_NAME for production or set environment variable for local dev.`)
}

/**
 * Clear the secret cache (useful for testing or forcing refresh)
 */
export function clearSecretCache(telemetryService?: TelemetryService): void {
    secretCache.clear()
    if (telemetryService) {
        telemetryService.trackGameEvent('Secret.Cache.Clear', {})
    }
}

/**
 * Get cache statistics (for monitoring/debugging)
 */
export function getSecretCacheStats(): { size: number; keys: string[] } {
    return {
        size: secretCache.size,
        keys: Array.from(secretCache.keys())
    }
}
