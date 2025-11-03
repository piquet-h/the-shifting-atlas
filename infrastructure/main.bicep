param name string = 'atlas'
param location string = resourceGroup().location
param unique string = substring(uniqueString(resourceGroup().id), 0, 4)

@description('Optional additional AAD principal object IDs (users, service principals, managed identities) to receive Cosmos DB Built-in Data Contributor on both Gremlin and SQL accounts for local dev or tooling.')
param additionalCosmosDataContributors array = []

var storageName = toLower('st${name}${unique}')

resource storageAccount 'Microsoft.Storage/storageAccounts@2025-01-01' = {
  #disable-next-line BCP334
  name: storageName
  location: location

  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: true
    allowSharedKeyAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    encryption: {
      services: {
        blob: {
          enabled: true
        }
        file: {
          enabled: true
        }
      }
      keySource: 'Microsoft.Storage'
    }
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
  }

  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'

  resource blobService 'blobServices' = {
    name: 'default'
    properties: {
      deleteRetentionPolicy: {}
    }

    resource container 'containers' = {
      name: 'function-releases'
    }
  }
}

resource applicationInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${name}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
  }
}

resource backendPlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: 'plan-${name}'
  kind: 'linux'
  location: location
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
  }
  properties: {
    reserved: true
  }
}

resource backendFunctionApp 'Microsoft.Web/sites@2024-11-01' = {
  name: 'func-${name}'
  location: location
  kind: 'functionapp'
  tags: {
    'hidden-link: /app-insights-resource-id': '/subscriptions/1dae96f3-103a-4036-8b81-17bc0c87c3c8/resourceGroups/rg-atlas-game/providers/microsoft.insights/components/appi-atlas'
  }
  properties: {
    enabled: true
    serverFarmId: backendPlan.id
    httpsOnly: true

    siteConfig: {
      minTlsVersion: '1.3'
      http20Enabled: true
      alwaysOn: false
      cors: {
        allowedOrigins: [
          format('https://{0}', staticSite.properties.defaultHostname)
          'https://portal.azure.com'
        ]
        supportCredentials: false
      }
    }

    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storageAccount.properties.primaryEndpoints.blob}${storageAccount::blobService::container.name}'
          authentication: {
            type: 'SystemAssignedIdentity'
          }
        }
      }
      runtime: {
        name: 'node'
        version: '20'
      }
      scaleAndConcurrency: {
        instanceMemoryMB: 512
        maximumInstanceCount: 40
      }
    }
  }

  identity: {
    type: 'SystemAssigned'
  }

  resource appSettings 'config' = {
    name: 'appsettings'

    properties: {
      AzureWebJobsStorage__accountName: storageAccount.name

      FUNCTIONS_EXTENSION_VERSION: '~4'
      FUNCTIONS_NODE_BLOCK_ON_ENTRY_POINT_ERROR: 'true'

      APPLICATIONINSIGHTS_CONNECTION_STRING: applicationInsights.properties.ConnectionString

      CosmosGraphAccount__endpoint: cosmosGraphAccount.properties.documentEndpoint
      CosmosSqlAccount__endpoint: cosmosSqlAccount.properties.documentEndpoint
      ServiceBusAtlas__fullyQualifiedNamespace: '${serviceBusNamespace.name}.servicebus.windows.net'

      // Cosmos DB Gremlin API Configuration
      PERSISTENCE_MODE: 'cosmos'
      PERSISTENCE_STRICT: '1'
      COSMOS_GREMLIN_ENDPOINT: cosmosGraphAccount.properties.documentEndpoint
      COSMOS_GREMLIN_DATABASE: 'game'
      COSMOS_GREMLIN_GRAPH: 'world'

      // Cosmos DB SQL API Configuration
      COSMOS_SQL_ENDPOINT: cosmosSqlAccount.properties.documentEndpoint
      COSMOS_SQL_DATABASE: 'game'
      COSMOS_SQL_CONTAINER_PLAYERS: 'players'
      COSMOS_SQL_CONTAINER_INVENTORY: 'inventory'
      COSMOS_SQL_CONTAINER_LAYERS: 'descriptionLayers'
      COSMOS_SQL_CONTAINER_EVENTS: 'worldEvents'
    }
  }
}

resource cosmosGraphAccount 'Microsoft.DocumentDB/databaseAccounts@2025-04-15' = {
  name: 'cosmosgraph-${name}'
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
    capabilities: [
      {
        name: 'EnableGremlin'
      }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
  }

  resource gremlinDb 'gremlinDatabases' = {
    name: 'game'
    properties: {
      resource: {
        id: 'game'
      }
      options: {}
    }

    resource gremlinGraph 'graphs' = {
      name: 'world'
      properties: {
        resource: {
          id: 'world'
          partitionKey: {
            paths: [
              '/partitionKey'
            ]
            kind: 'Hash'
            version: 2
          }
        }
        options: {
          throughput: 400
        }
      }
    }

    resource gremlinGraphTest 'graphs' = {
      name: 'world-test'
      properties: {
        resource: {
          id: 'world-test'
          partitionKey: {
            paths: [
              '/partitionKey'
            ]
            kind: 'Hash'
            version: 2
          }
        }
        options: {
          throughput: 400
        }
      }
    }
  }
}

resource cosmosSqlAccount 'Microsoft.DocumentDB/databaseAccounts@2025-04-15' = {
  name: 'cosmossql-${name}'
  location: location
  properties: {
    databaseAccountOfferType: 'Standard'
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

  resource sqlDb 'sqlDatabases' = {
    name: 'game'
    properties: {
      resource: {
        id: 'game'
      }
      options: {}
    }

    resource sqlPlayers 'containers' = {
      name: 'players'
      properties: {
        resource: {
          id: 'players'
          partitionKey: {
            paths: ['/id']
            kind: 'Hash'
            version: 2
          }
        }
        options: {}
      }
    }

    resource sqlInventory 'containers' = {
      name: 'inventory'
      properties: {
        resource: {
          id: 'inventory'
          partitionKey: {
            paths: ['/playerId']
            kind: 'Hash'
            version: 2
          }
        }
        options: {}
      }
    }

    resource sqlLayers 'containers' = {
      name: 'descriptionLayers'
      properties: {
        resource: {
          id: 'descriptionLayers'
          partitionKey: {
            paths: ['/locationId']
            kind: 'Hash'
            version: 2
          }
        }
        options: {}
      }
    }

    resource sqlEvents 'containers' = {
      name: 'worldEvents'
      properties: {
        resource: {
          id: 'worldEvents'
          partitionKey: {
            paths: ['/scopeKey']
            kind: 'Hash'
            version: 2
          }
        }
        options: {}
      }
    }
  }
}

// Optional: grant the same data contributor role to any extra principals (e.g., developer AAD users for local Gremlin access)
// This helps avoid 403 Substatus 5301 locally when DefaultAzureCredential resolves to a developer identity instead of the Function App MI.
// Each principal gets role assignment on BOTH graph & sql accounts.
@batchSize(5)
resource extraCosmosGraphContrib 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for principalId in additionalCosmosDataContributors: {
    name: guid(cosmosGraphAccount.id, principalId, 'cosmos-graph-extra-data-contrib')
    scope: cosmosGraphAccount
    properties: {
      roleDefinitionId: subscriptionResourceId(
        'Microsoft.Authorization/roleDefinitions',
        '5bd9cd88-fe45-4216-938b-f97437e15450'
      )
      principalId: principalId
      principalType: 'ServicePrincipal' // AAD users & service principals accepted; Azure will coerce type.
    }
  }
]

@batchSize(5)
resource extraCosmosSqlContrib 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for principalId in additionalCosmosDataContributors: {
    name: guid(cosmosSqlAccount.id, principalId, 'cosmos-sql-extra-data-contrib')
    scope: cosmosSqlAccount
    properties: {
      roleDefinitionId: subscriptionResourceId(
        'Microsoft.Authorization/roleDefinitions',
        '5bd9cd88-fe45-4216-938b-f97437e15450'
      )
      principalId: principalId
      principalType: 'ServicePrincipal'
    }
  }
]

resource serviceBusNamespace 'Microsoft.ServiceBus/namespaces@2024-01-01' = {
  name: 'sb-atlas-${unique}'
  location: location
  sku: {
    name: 'Basic'
    tier: 'Basic'
  }
  properties: {}

  resource worldEventsQueue 'queues' = {
    name: 'world-events'
  }
}

resource staticSite 'Microsoft.Web/staticSites@2024-11-01' = {
  name: 'stapp-atlas'
  kind: 'app,linux'
  location: location
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }

  identity: {
    type: 'SystemAssigned'
  }

  properties: {
    allowConfigFileUpdates: true
    buildProperties: {
      skipGithubActionWorkflowGeneration: true
    }
  }

  resource linkedBackend 'linkedBackends' = {
    name: 'backend'
    properties: {
      backendResourceId: backendFunctionApp.id
      region: backendFunctionApp.location
    }
  }
}

// Role assignment to grant the static web app access to the backend function app
resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(staticSite.id, backendFunctionApp.id, 'WebsiteContributor')
  scope: backendFunctionApp
  properties: {
    principalId: staticSite.identity.principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      'de139f84-1756-47ae-9be6-808fbbe84772'
    ) // Website Contributor
    principalType: 'ServicePrincipal'
  }
}

// Role assignments granting the Function App managed identity data access to Cosmos (Gremlin + SQL) and Service Bus send/receive.
// Using Built-in Data Contributor for Cosmos (read/write) and Service Bus Data Sender/Receiver.
resource cosmosGraphDataContrib 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(cosmosGraphAccount.id, backendFunctionApp.id, 'cosmos-graph-data-contrib')
  scope: cosmosGraphAccount
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '5bd9cd88-fe45-4216-938b-f97437e15450'
    ) // Cosmos DB Built-in Data Contributor
    principalId: backendFunctionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource cosmosSqlDataContrib 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(cosmosSqlAccount.id, backendFunctionApp.id, 'cosmos-sql-data-contrib')
  scope: cosmosSqlAccount
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '5bd9cd88-fe45-4216-938b-f97437e15450'
    )
    principalId: backendFunctionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource sbDataSender 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(serviceBusNamespace.id, backendFunctionApp.id, 'sb-data-sender')
  scope: serviceBusNamespace
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '69a216fc-b8fb-44d8-bc22-1f3c2cd27a39'
    ) // Service Bus Data Sender
    principalId: backendFunctionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource sbDataReceiver 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(serviceBusNamespace.id, backendFunctionApp.id, 'sb-data-receiver')
  scope: serviceBusNamespace
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '4f6d3b9b-027b-4f4c-9142-0e5a2a2247e0'
    ) // Service Bus Data Receiver
    principalId: backendFunctionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource storageBlobContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, backendFunctionApp.id, 'storage-blob-contributor')
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
    ) // Storage Blob Data Contributor
    principalId: backendFunctionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}
