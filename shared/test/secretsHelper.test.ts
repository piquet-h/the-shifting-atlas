import assert from 'node:assert'
import { describe, test, beforeEach } from 'node:test'
import { getSecret, clearSecretCache, getSecretCacheStats, ALLOWED_SECRET_KEYS } from '../src/secrets/secretsHelper.js'

describe('secretsHelper', () => {
    beforeEach(() => {
        // Clear cache before each test
        clearSecretCache()
        // Clear any test environment variables
        delete process.env.KEYVAULT_NAME
        delete process.env.COSMOS_GREMLIN_KEY
        delete process.env.NODE_ENV
    })

    test('ALLOWED_SECRET_KEYS contains expected keys', () => {
        assert.ok(ALLOWED_SECRET_KEYS.includes('cosmos-primary-key'))
        assert.ok(ALLOWED_SECRET_KEYS.includes('cosmos-sql-primary-key'))
        assert.ok(ALLOWED_SECRET_KEYS.includes('service-bus-connection-string'))
        assert.ok(ALLOWED_SECRET_KEYS.includes('model-provider-api-key'))
        assert.ok(ALLOWED_SECRET_KEYS.includes('signing-secret'))
    })

    test('rejects non-allowlisted secret key', async () => {
        await assert.rejects(
            async () => {
                await getSecret('unauthorized-secret')
            },
            {
                message: /not in allowlist/
            }
        )
    })

    test('uses local environment variable in development', async () => {
        process.env.NODE_ENV = 'development'
        process.env.COSMOS_GREMLIN_KEY = 'test-local-key-123'

        const secret = await getSecret('cosmos-primary-key')
        assert.strictEqual(secret, 'test-local-key-123')
    })

    test('throws error if secret not found', async () => {
        process.env.NODE_ENV = 'development'
        // No KEYVAULT_NAME, no local env var

        await assert.rejects(
            async () => {
                await getSecret('cosmos-primary-key')
            },
            {
                message: /not found/
            }
        )
    })

    test('refuses to use local env var in production', async () => {
        process.env.NODE_ENV = 'production'
        process.env.COSMOS_GREMLIN_KEY = 'test-local-key-123'

        await assert.rejects(
            async () => {
                await getSecret('cosmos-primary-key')
            },
            {
                message: /Refusing to use local environment variable.*in production/
            }
        )
    })

    test('cache stats show empty cache initially', () => {
        const stats = getSecretCacheStats()
        assert.strictEqual(stats.size, 0)
        assert.deepStrictEqual(stats.keys, [])
    })

    test('clearSecretCache clears the cache', () => {
        // Cache is cleared in beforeEach, but test the function directly
        clearSecretCache()
        const stats = getSecretCacheStats()
        assert.strictEqual(stats.size, 0)
    })
})
