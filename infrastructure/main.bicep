param location string = resourceGroup().location
// Naming: subscription dedicated to this project so we avoid redundant prefixes.
// Stable hash keeps uniqueness when required.
// Static Web App: web-${hash}
// Cosmos DB Account: cosmos${hash}
param staticWebAppName string = 'web-${uniqueString(resourceGroup().id)}'
param cosmosAccountName string = 'cosmos${uniqueString(resourceGroup().id)}'
param repositoryUrl string
param branch string

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
resource staticSite 'Microsoft.Web/staticSites@2022-09-01' = {
  name: staticWebAppName
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    repositoryUrl: repositoryUrl
    branch: branch
    buildProperties: {
      skipGithubActionWorkflowGeneration: true
    }
  }

  resource config 'config@2024-11-01' = {
    name: 'functionappsettings'
    properties: {
      COSMOS_ENDPOINT: cosmos.properties.documentEndpoint
      COSMOS_KEY: cosmos.listKeys().primaryMasterKey
    }
  }
}

output cosmosAccountName string = cosmos.name
output cosmosEndpoint string = cosmos.properties.documentEndpoint
output staticWebAppName string = staticSite.name
