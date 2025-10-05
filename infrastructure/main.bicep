targetScope = 'resourceGroup'

param location string = resourceGroup().location
// Naming: subscription dedicated to this project so we avoid redundant prefixes.
// Stable hash keeps uniqueness when required.
// Static Web App: web-${hash}
// Cosmos DB Account: cosmos${hash}
param staticWebAppName string = 'web-${uniqueString(resourceGroup().id)}'
param cosmosAccountName string = 'cosmos${uniqueString(resourceGroup().id)}'
// Separate SQL (Core) API account for document projections (players, inventory, events, layers)
// Keeping a distinct account avoids API mixing ambiguity and allows RU governance independent of Gremlin graph.
param cosmosSqlAccountName string = 'cosmosdoc${uniqueString(resourceGroup().id)}'
param keyVaultName string = 'kv-${uniqueString(resourceGroup().id)}'
param appInsightsName string = 'appi-${uniqueString(resourceGroup().id)}'
param serviceBusNamespaceName string = 'sb-${uniqueString(resourceGroup().id)}'
param functionAppName string = 'func-${uniqueString(resourceGroup().id)}'
param storageAccountName string = 'st${uniqueString(resourceGroup().id)}'
param appServicePlanName string = 'asp-${uniqueString(resourceGroup().id)}'
@description('SKU tier for the Static Web App. Free for personal/dev, Standard for production features like more staging slots & private endpoints.')
@allowed([
  'Free'
  'Standard'
])
param staticWebAppSku string = 'Standard'

// Gremlin (graph) logical database & graph names + RU throughput (dev scale)
param cosmosGremlinDatabaseName string = 'game'
param cosmosGremlinGraphName string = 'world'
@minValue(400)
param cosmosGremlinGraphThroughput int = 400

// SQL (Core) API database & container names (serverless – no provisioned throughput). Serverless is cheaper for spiky dev load.
param cosmosSqlDatabaseName string = 'game-docs'
param cosmosSqlPlayersContainerName string = 'players'
param cosmosSqlInventoryContainerName string = 'inventory'
param cosmosSqlLayersContainerName string = 'descriptionLayers'
param cosmosSqlEventsContainerName string = 'worldEvents'

// Service Bus queue name for world events
param serviceBusQueueName string = 'world-events'

// Cosmos DB account (Gremlin) - minimal configuration for development & testing
resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2023-09-15' = {
  name: cosmosAccountName
  location: location
  properties: {
    databaseAccountOfferType: 'Standard'
    enableFreeTier: true
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

// Cosmos DB account (SQL / Core) - separate for document / projection workload.
resource cosmosSql 'Microsoft.DocumentDB/databaseAccounts@2023-09-15' = {
  name: cosmosSqlAccountName
  location: location
  properties: {
    databaseAccountOfferType: 'Standard'
    // Serverless (no provisioned RU). Free tier already used by Gremlin account.
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
  }
}

// SQL database
resource sqlDb 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2023-09-15' = {
  name: cosmosSqlDatabaseName
  parent: cosmosSql
  properties: {
    resource: {
      id: cosmosSqlDatabaseName
    }
    options: {}
  }
}

// Players container (PK /id)
resource sqlPlayers 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-09-15' = {
  name: cosmosSqlPlayersContainerName
  parent: sqlDb
  properties: {
    resource: {
      id: cosmosSqlPlayersContainerName
      partitionKey: {
        paths: [ '/id' ]
        kind: 'Hash'
        version: 2
      }
    }
    // Serverless: leave options empty (no throughput block)
    options: {}
  }
}

// Inventory container (PK /playerId)
resource sqlInventory 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-09-15' = {
  name: cosmosSqlInventoryContainerName
  parent: sqlDb
  properties: {
    resource: {
      id: cosmosSqlInventoryContainerName
      partitionKey: {
        paths: [ '/playerId' ]
        kind: 'Hash'
        version: 2
      }
    }
    options: {}
  }
}

// Description layers container (PK /locationId)
resource sqlLayers 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-09-15' = {
  name: cosmosSqlLayersContainerName
  parent: sqlDb
  properties: {
    resource: {
      id: cosmosSqlLayersContainerName
      partitionKey: {
        paths: [ '/locationId' ]
        kind: 'Hash'
        version: 2
      }
    }
    options: {}
  }
}

// World events container (PK /scopeKey) scopeKey pattern: loc:<locationId> or player:<playerId>
resource sqlEvents 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-09-15' = {
  name: cosmosSqlEventsContainerName
  parent: sqlDb
  properties: {
    resource: {
      id: cosmosSqlEventsContainerName
      partitionKey: {
        paths: [ '/scopeKey' ]
        kind: 'Hash'
        version: 2
      }
      // TTL or indexing policy amendments can be added later.
    }
    options: {}
  }
}

// Gremlin database (logical graph database)
resource gremlinDb 'Microsoft.DocumentDB/databaseAccounts/gremlinDatabases@2023-09-15-preview' = {
  name: cosmosGremlinDatabaseName
  parent: cosmos
  properties: {
    resource: {
      id: cosmosGremlinDatabaseName
    }
    options: {}
  }
}

// Gremlin graph (container). Partition key on /partitionKey.
// Note: Gremlin API reserves /id and /label, so a custom property must be used.
// All vertices must set this property; a common strategy is to use vertex type or a region identifier.
resource gremlinGraph 'Microsoft.DocumentDB/databaseAccounts/gremlinDatabases/graphs@2023-09-15-preview' = {
  name: cosmosGremlinGraphName
  parent: gremlinDb
  properties: {
    resource: {
      id: cosmosGremlinGraphName
      partitionKey: {
        paths: [
          '/partitionKey'
        ]
        kind: 'Hash'
        version: 2
      }
    }
    options: {
      throughput: cosmosGremlinGraphThroughput
    }
  }
}

// Service Bus Namespace (Basic tier - free for dev/test up to 1M operations/month)
// Updated to latest stable API version with available type definitions (2024-01-01)
resource serviceBusNamespace 'Microsoft.ServiceBus/namespaces@2024-01-01' = {
  name: serviceBusNamespaceName
  location: location
  sku: {
    name: 'Basic'
    tier: 'Basic'
  }
  properties: {}
}

// Service Bus Queue for world events
resource serviceBusQueue 'Microsoft.ServiceBus/namespaces/queues@2024-01-01' = {
  name: serviceBusQueueName
  parent: serviceBusNamespace
  properties: {
    maxSizeInMegabytes: 1024
    defaultMessageTimeToLive: 'P1D'
    lockDuration: 'PT5M'
    enablePartitioning: false
    requiresDuplicateDetection: false
    requiresSession: false
  }
}

// Storage Account for Function App (required for consumption plan)
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
  }
}

// App Service Plan (Consumption / Dynamic - Y1 SKU is free tier)
resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: appServicePlanName
  location: location
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  properties: {
    reserved: true // Required for Linux
  }
}

// Function App for backend queue processors
resource functionApp 'Microsoft.Web/sites@2023-01-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      linuxFxVersion: 'NODE|20'
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'
        }
        {
          name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'
        }
        {
          name: 'WEBSITE_CONTENTSHARE'
          value: toLower(functionAppName)
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~20'
        }
        {
          name: 'ServiceBusConnection__fullyQualifiedNamespace'
          value: '${serviceBusNamespaceName}.servicebus.windows.net'
        }
        {
          name: 'COSMOS_ENDPOINT'
          value: cosmos.properties.documentEndpoint
        }
        {
          name: 'KEYVAULT_NAME'
          value: keyVaultName
        }
        {
          name: 'COSMOS_KEY_SECRET_NAME'
          value: 'cosmos-primary-key'
        }
        {
          name: 'COSMOS_GREMLIN_DATABASE'
          value: cosmosGremlinDatabaseName
        }
        {
          name: 'COSMOS_GREMLIN_GRAPH'
          value: cosmosGremlinGraphName
        }
        {
          name: 'COSMOS_SQL_ENDPOINT'
          value: cosmosSql.properties.documentEndpoint
        }
        {
          name: 'COSMOS_SQL_DATABASE'
          value: cosmosSqlDatabaseName
        }
        {
          name: 'COSMOS_SQL_KEY_SECRET_NAME'
          value: 'cosmos-sql-primary-key'
        }
        {
          name: 'COSMOS_SQL_CONTAINER_PLAYERS'
          value: cosmosSqlPlayersContainerName
        }
        {
          name: 'COSMOS_SQL_CONTAINER_INVENTORY'
          value: cosmosSqlInventoryContainerName
        }
        {
          name: 'COSMOS_SQL_CONTAINER_LAYERS'
          value: cosmosSqlLayersContainerName
        }
        {
          name: 'COSMOS_SQL_CONTAINER_EVENTS'
          value: cosmosSqlEventsContainerName
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
        {
          name: 'WORLD_EVENT_DUPE_TTL_MS'
          value: '600000'
        }
        {
          name: 'WORLD_EVENT_CACHE_MAX_SIZE'
          value: '10000'
        }
        {
          name: 'WORLD_EVENT_DEADLETTER_MODE'
          value: 'log-only'
        }
      ]
      ftpsState: 'Disabled'
    }
    httpsOnly: true
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
    buildProperties: {
      skipGithubActionWorkflowGeneration: true
    }
  }

  // Application settings now exclude the raw key. Functions should use managed identity to retrieve the secret from Key Vault.
  // Adjusted child config API version to align with parent and avoid validation issues.
  resource config 'config@2024-04-01' = {
    name: 'functionappsettings'
    properties: {
      COSMOS_ENDPOINT: cosmos.properties.documentEndpoint
      KEYVAULT_NAME: keyVault.name
      COSMOS_KEY_SECRET_NAME: 'cosmos-primary-key'
      COSMOS_GREMLIN_DATABASE: cosmosGremlinDatabaseName
      COSMOS_GREMLIN_GRAPH: cosmosGremlinGraphName
      // SQL (Core) document store settings
      COSMOS_SQL_ENDPOINT: cosmosSql.properties.documentEndpoint
      COSMOS_SQL_DATABASE: cosmosSqlDatabaseName
      COSMOS_SQL_KEY_SECRET_NAME: 'cosmos-sql-primary-key'
      COSMOS_SQL_CONTAINER_PLAYERS: cosmosSqlPlayersContainerName
      COSMOS_SQL_CONTAINER_INVENTORY: cosmosSqlInventoryContainerName
      COSMOS_SQL_CONTAINER_LAYERS: cosmosSqlLayersContainerName
      COSMOS_SQL_CONTAINER_EVENTS: cosmosSqlEventsContainerName
      // Application Insights connection string surfaced to the integrated Functions API
      APPLICATIONINSIGHTS_CONNECTION_STRING: appInsights.properties.ConnectionString
    }
  }
}

// Application Insights component for telemetry (Functions + frontend JS SDK)
// Using connection string (preferred over instrumentation key) for flexibility.
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    // Disable IP masking changes or sampling in template; can be tuned later.
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

// Add Function App access policy to Key Vault after Function App is created
resource keyVaultAccessPolicyForFunctionApp 'Microsoft.KeyVault/vaults/accessPolicies@2023-02-01' = {
  name: 'add'
  parent: keyVault
  properties: {
    accessPolicies: [
      {
        tenantId: tenant().tenantId
        objectId: functionApp.identity.principalId
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

// Store SQL (Core) Cosmos primary key as separate secret
resource cosmosSqlPrimaryKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  name: 'cosmos-sql-primary-key'
  parent: keyVault
  properties: {
    value: cosmosSql.listKeys().primaryMasterKey
  }
}

// Role assignment: Grant Function App "Azure Service Bus Data Receiver" role on the namespace
// Built-in role ID: 4f6d3b9b-027b-4f4c-9142-0e5a2a2247e0
resource serviceBusDataReceiverRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(serviceBusNamespace.id, functionApp.id, '4f6d3b9b-027b-4f4c-9142-0e5a2a2247e0')
  scope: serviceBusNamespace
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4f6d3b9b-027b-4f4c-9142-0e5a2a2247e0')
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output cosmosAccountName string = cosmos.name
output cosmosEndpoint string = cosmos.properties.documentEndpoint
output cosmosSqlEndpoint string = cosmosSql.properties.documentEndpoint
output staticWebAppName string = staticSite.name
output keyVaultName string = keyVault.name
output cosmosPrimaryKeySecretName string = cosmosPrimaryKeySecret.name
output cosmosSqlPrimaryKeySecretName string = cosmosSqlPrimaryKeySecret.name
output appInsightsName string = appInsights.name
output appInsightsConnectionString string = appInsights.properties.ConnectionString
output cosmosGremlinDatabaseName string = gremlinDb.name
output cosmosGremlinGraphName string = gremlinGraph.name
output cosmosSqlDatabaseName string = sqlDb.name
output cosmosSqlPlayersContainerName string = sqlPlayers.name
output cosmosSqlInventoryContainerName string = sqlInventory.name
output cosmosSqlLayersContainerName string = sqlLayers.name
output cosmosSqlEventsContainerName string = sqlEvents.name
output serviceBusNamespaceName string = serviceBusNamespace.name
output serviceBusQueueName string = serviceBusQueue.name
output functionAppName string = functionApp.name
output storageAccountName string = storageAccount.name
output appServicePlanName string = appServicePlan.name
