/**
 * Unit test: CosmosDbSqlClient must not support key-based auth.
 * Local + prod should use Azure AD (DefaultAzureCredential) only.
 */

import assert from 'node:assert'
import { describe, test } from 'node:test'
import { CosmosDbSqlClient } from '../../src/repos/base/cosmosDbSqlClient.js'

describe('CosmosDbSqlClient auth', () => {
    test('rejects key-based auth (must use Azure AD)', () => {
        assert.throws(
            () => {
                // Force a legacy shape via cast to simulate accidental key usage.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                new CosmosDbSqlClient({ endpoint: 'https://example.documents.azure.com:443/', database: 'game', key: 'nope' } as any)
            },
            (err: unknown) => {
                assert.ok(err instanceof Error)
                return /key authentication is not supported/i.test(err.message)
            }
        )
    })

    test('constructs without key (AAD path)', () => {
        // We don't assert internals of CosmosClient construction here (no module mocking);
        // we only assert that the supported AAD-based configuration does not throw.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        assert.doesNotThrow(() => new CosmosDbSqlClient({ endpoint: 'https://example.documents.azure.com:443/', database: 'game' } as any))
    })
})
