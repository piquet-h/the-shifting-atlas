import { TokenCredential } from '@azure/core-auth'
import { DefaultAzureCredential, ManagedIdentityCredential } from '@azure/identity'
import { injectable } from 'inversify'

export interface IAzureCredentialFactory {
    createCredential(): TokenCredential
}

type DefaultAzureCredentialCtor = new () => TokenCredential
type ManagedIdentityCredentialCtor = typeof ManagedIdentityCredential

function isAzureHostedEnvironment(): boolean {
    return Boolean(process.env.WEBSITE_INSTANCE_ID) || Boolean(process.env.WEBSITE_SITE_NAME) || Boolean(process.env.WEBSITE_RESOURCE_GROUP)
}

/**
 * Centralized factory for Azure TokenCredential creation.
 *
 * Behavior:
 * - Azure-hosted runtime: uses ManagedIdentityCredential directly (no EnvironmentCredential probe).
 * - Local/dev runtime: keeps full DefaultAzureCredential chain for developer flexibility.
 */
@injectable()
export class AzureCredentialFactory implements IAzureCredentialFactory {
    constructor(
        private readonly defaultCredentialCtor: DefaultAzureCredentialCtor = DefaultAzureCredential,
        private readonly managedIdentityCredentialCtor: ManagedIdentityCredentialCtor = ManagedIdentityCredential
    ) {}

    createCredential(): TokenCredential {
        if (isAzureHostedEnvironment()) {
            const managedIdentityClientId = process.env.AZURE_CLIENT_ID || undefined
            return managedIdentityClientId
                ? new this.managedIdentityCredentialCtor(managedIdentityClientId)
                : new this.managedIdentityCredentialCtor()
        }

        return new this.defaultCredentialCtor()
    }
}
