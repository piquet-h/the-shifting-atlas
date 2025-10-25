import assert from 'node:assert'
import process from 'node:process'
import { beforeEach, describe, test } from 'node:test'
import { ALLOWED_SECRET_KEYS, clearSecretCache, getSecret, getSecretCacheStats } from '../../src/secrets/secretsHelper.js'

describe('secretsHelper', () => {
    beforeEach(() => {
        // Clear cache before each test
        clearSecretCache()
        // Clear any test environment variables
        delete process.env.KEYVAULT_NAME
        delete process.env.COSMOS_GREMLIN_KEY
        delete process.env.NODE_ENV
    })

    test('ALLOWED_SECRET_KEYS contains expected keys (post-migration)', () => {
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

    test('uses local environment variable in development (service bus)', async () => {
        process.env.NODE_ENV = 'development'
        process.env.SERVICE_BUS_CONNECTION_STRING = 'Endpoint=sb://local/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=abc'

        const secret = await getSecret('service-bus-connection-string')
        assert.ok(secret.includes('Endpoint=sb://local/'))
    })

    test('throws error if secret not found (model provider key)', async () => {
        process.env.NODE_ENV = 'development'
        await assert.rejects(
            async () => {
                await getSecret('model-provider-api-key')
            },
            { message: /not found/ }
        )
    })

    test('refuses to use local env var in production (service bus)', async () => {
        process.env.NODE_ENV = 'production'
        process.env.SERVICE_BUS_CONNECTION_STRING = 'Endpoint=sb://local/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=abc'
        await assert.rejects(
            async () => {
                await getSecret('service-bus-connection-string')
            },
            { message: /Refusing to use local environment variable.*in production/ }
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
