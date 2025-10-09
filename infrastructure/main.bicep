param name string = 'atlas'
param location string = resourceGroup().location
param unique string = substring(uniqueString(resourceGroup().id), 0, 4)

var storageName = 'st${name}${substring(uniqueString(subscription().id, resourceGroup().id), 0, 4)}'

resource storageAccount 'Microsoft.Storage/storageAccounts@2025-01-01' = {
  name: storageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
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
  location: location
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
}

resource backendFunctionApp 'Microsoft.Web/sites@2024-11-01' = {
  name: 'func-${name}'
  location: location
  kind: 'functionapp'
  properties: {
    serverFarmId: backendPlan.id
    httpsOnly: true
  }

  identity: {
    type: 'SystemAssigned'
  }

  resource appSettings 'config' = {
    name: 'appsettings'

    properties: {
      FUNCTIONS_WORKER_RUNTIME: 'node'
      FUNCTIONS_EXTENSION_VERSION: '~4'

      WEBSITE_CONTENTAZUREFILECONNECTIONSTRING: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net'
      WEBSITE_CONTENTSHARE: toLower(backendFunctionApp.name)
      WEBSITE_NODE_DEFAULT_VERSION: '~20'
      WEBSITE_RUN_FROM_PACKAGE: '1'
      AzureWebJobsStorage__accountName: storageAccount.name

      APPLICATIONINSIGHTS_CONNECTION_STRING: applicationInsights.properties.ConnectionString

      ComsosGraphAccount__endpoint: cosmosGraphAccount.properties.documentEndpoint
      CosmosSqlAccount__endpoint: cosmosSqlAccount.properties.documentEndpoint
      ServiceBusAtlas__fullyQualifiedNamespace: '${serviceBusNamespace.name}.servicebus.windows.net'
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
  location: 'westus2'
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }

  identity: {
    type: 'SystemAssigned'
  }

  // Deployment unlink: removed GitHub provider/repository/branch so that
  // the Static Web App operates in manual (unlinked) mode and is deployed
  // exclusively via our custom GitHub Action using the SWA CLI + OIDC.
  // Keeping buildProperties minimal (apiLocation empty for now). If an API
  // directory is added later, update buildProperties or rely solely on CLI args.
  properties: {
    buildProperties: {
      apiLocation: ''
      // skipGithubActionWorkflowGeneration retained to suppress auto workflow suggestions
      skipGithubActionWorkflowGeneration: true
    }
  }

  resource backend 'linkedBackends' = {
    name: 'default'
    properties: {
      backendResourceId: backendFunctionApp.id
      region: backendFunctionApp.location
    }
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

output functionAppHost string = 'https://${backendFunctionApp.name}.azurewebsites.net'
output staticWebAppName string = staticSite.name
output staticWebAppHostname string = staticSite.properties.defaultHostname
