import assert from 'node:assert'
import process from 'node:process'
import { afterEach, describe, test } from 'node:test'
import { AzureCredentialFactory } from '../../src/auth/azureCredentialFactory.js'

class LocalCredential {
    readonly kind = 'local'
}

class ManagedIdentityCredential {
    readonly kind = 'managed'

    constructor(public readonly clientId?: string) {}
}

const ORIGINAL_ENV = {
    WEBSITE_INSTANCE_ID: process.env.WEBSITE_INSTANCE_ID,
    WEBSITE_SITE_NAME: process.env.WEBSITE_SITE_NAME,
    WEBSITE_RESOURCE_GROUP: process.env.WEBSITE_RESOURCE_GROUP,
    AZURE_CLIENT_ID: process.env.AZURE_CLIENT_ID
}

describe('AzureCredentialFactory', () => {
    afterEach(() => {
        process.env.WEBSITE_INSTANCE_ID = ORIGINAL_ENV.WEBSITE_INSTANCE_ID
        process.env.WEBSITE_SITE_NAME = ORIGINAL_ENV.WEBSITE_SITE_NAME
        process.env.WEBSITE_RESOURCE_GROUP = ORIGINAL_ENV.WEBSITE_RESOURCE_GROUP
        process.env.AZURE_CLIENT_ID = ORIGINAL_ENV.AZURE_CLIENT_ID
    })

    test('does not exclude EnvironmentCredential for local/dev environments', () => {
        delete process.env.WEBSITE_INSTANCE_ID
        delete process.env.WEBSITE_SITE_NAME
        delete process.env.WEBSITE_RESOURCE_GROUP

        const factory = new AzureCredentialFactory(
            LocalCredential as unknown as new () => LocalCredential,
            ManagedIdentityCredential as unknown as new (clientId?: string) => ManagedIdentityCredential
        )
        const credential = factory.createCredential() as unknown as LocalCredential

        assert.strictEqual(credential.kind, 'local')
    })

    test('uses ManagedIdentityCredential when running in Azure-hosted environment', () => {
        process.env.WEBSITE_SITE_NAME = 'atlas-func-app'
        process.env.AZURE_CLIENT_ID = '11111111-1111-1111-1111-111111111111'

        const factory = new AzureCredentialFactory(
            LocalCredential as unknown as new () => LocalCredential,
            ManagedIdentityCredential as unknown as new (clientId?: string) => ManagedIdentityCredential
        )
        const credential = factory.createCredential() as unknown as ManagedIdentityCredential

        assert.strictEqual(credential.kind, 'managed')
        assert.strictEqual(credential.clientId, '11111111-1111-1111-1111-111111111111')
    })
})
