param location string = resourceGroup().location
// Naming: subscription dedicated to this project so we avoid redundant prefixes.
// Stable hash keeps uniqueness when required.
// Static Web App: web-${hash}
// Cosmos DB Account: cosmos${hash}
param staticWebAppName string = 'web-${uniqueString(resourceGroup().id)}'
param cosmosAccountName string = 'cosmos${uniqueString(resourceGroup().id)}'
param keyVaultName string = 'kv-${uniqueString(resourceGroup().id)}'
param repositoryUrl string
param branch string
@description('SKU tier for the Static Web App. Free for personal/dev, Standard for production features like more staging slots & private endpoints.')
@allowed([
  'Free'
  'Standard'
])
param staticWebAppSku string = 'Free'

// Cosmos DB account (Gremlin) - minimal configuration for development & testing
resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2023-09-15' = {
  name: cosmosAccountName
  location: location
  properties: {
    databaseAccountOfferType: 'Standard'
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    // Enable Gremlin (graph) API
    capabilities: [
      {
        name: 'EnableGremlin'
      }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
  }
}

// Static Web App (lightweight resource). Note: For production you may prefer to
// create the Static Web App in the portal or via az cli with a deployment token.
// Static Web App resource
// Note: Some historical deployment errors ('SkuCode "Free" is invalid') can occur if:
//  1) Using an older API version
//  2) Attempting to downgrade from Standard -> Free (not supported) on an existing site
//  3) Region transient validation issues. Retry or choose a widely supported region (e.g. westus2, centralus, westeurope)
// API version aligned with current template reference (2024-04-01). Valid sku values: Free | Standard.
resource staticSite 'Microsoft.Web/staticSites@2024-04-01' = {
  name: staticWebAppName
  location: location
  sku: {
    // For staticSites the platform derives tier from name; including tier is optional.
    name: staticWebAppSku
    tier: staticWebAppSku
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    repositoryUrl: repositoryUrl
    branch: branch
    buildProperties: {
      skipGithubActionWorkflowGeneration: true
    }
  }

  // Application settings now exclude the raw key. Functions should use managed identity to retrieve the secret from Key Vault.
  resource config 'config@2024-11-01' = {
    name: 'functionappsettings'
    properties: {
      COSMOS_ENDPOINT: cosmos.properties.documentEndpoint
      KEYVAULT_NAME: keyVault.name
      COSMOS_KEY_SECRET_NAME: 'cosmos-primary-key'
    }
  }
}

// Key Vault to hold secrets (e.g., Cosmos primary key). Using access policies for simplicity.
resource keyVault 'Microsoft.KeyVault/vaults@2023-02-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: tenant().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: false
    enabledForDeployment: false
    enabledForDiskEncryption: false
    enabledForTemplateDeployment: true
    accessPolicies: [
      {
        tenantId: tenant().tenantId
        objectId: staticSite.identity.principalId
        permissions: {
          secrets: ['get', 'list']
        }
      }
    ]
  }
}

// Store Cosmos primary key as a secret so application can retrieve it at runtime via managed identity.
resource cosmosPrimaryKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  name: 'cosmos-primary-key'
  parent: keyVault
  properties: {
    value: cosmos.listKeys().primaryMasterKey
  }
}

output cosmosAccountName string = cosmos.name
output cosmosEndpoint string = cosmos.properties.documentEndpoint
output staticWebAppName string = staticSite.name
output keyVaultName string = keyVault.name
output cosmosPrimaryKeySecretName string = cosmosPrimaryKeySecret.name
