param name string = 'atlas'
param location string = resourceGroup().location
param unique string = substring(uniqueString(resourceGroup().id), 0, 4)

var storageName = 'st${name}${unique}'

resource storageAccount 'Microsoft.Storage/storageAccounts@2025-01-01' = {
  name: storageName
  location: location

  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
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
      properties: {
        publicAccess: 'None'
      }
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
  tags: {
    'azd-service-name': 'api'
  }
  kind: 'functionapp,linux'
  properties: {
    serverFarmId: backendPlan.id
    httpsOnly: true
    siteConfig: {
      minTlsVersion: '1.2'
      alwaysOn: false
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

      APPLICATIONINSIGHTS_CONNECTION_STRING: applicationInsights.properties.ConnectionString
      APPLICATIONINSIGHTS_AUTHENTICATION_STRING: 'Authorization=AAD'

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

  resource userProvidedFunctionApp 'userProvidedFunctionApps' = {
    name: 'backend'
    properties: {
      functionAppRegion: backendFunctionApp.location
      functionAppResourceId: backendFunctionApp.id
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

// output functionAppHost string = 'https://${backendFunctionApp.name}.azurewebsites.net'
// output staticWebAppName string = staticSite.name
// output staticWebAppHostname string = staticSite.properties.defaultHostname
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
