param name string = 'atlas'
param location string = resourceGroup().location
param foundryLocation string = 'eastus2'
param unique string = substring(uniqueString(resourceGroup().id), 0, 4)
@description('Optional suffix used only for the Foundry account/subdomain to avoid name collisions (defaults to the resource-group-based unique).')
param foundryUniqueSuffix string = substring(uniqueString(resourceGroup().id), 0, 4)

@description('Name of the Azure AI Foundry (Cognitive Services AIServices) account. Must be globally unique.')
param foundryAccountName string = toLower('aif-${name}-${foundryUniqueSuffix}')

@description('Custom subdomain name for the Foundry account. Required before creating Foundry projects.')
param foundryCustomSubDomainName string = foundryAccountName

@description('Name of the Azure AI Foundry project created under the Foundry account.')
param foundryProjectName string = name

@description('Name of the Azure AI Foundry project connection that points to the MCP server.')
param foundryMcpConnectionName string = toLower('mcp-${unique}')

@description('Optional override for the MCP server URL used by the Foundry project connection. If empty, defaults to the deployed Function App hostname + /mcp.')
param foundryMcpTargetOverride string = ''

@description('Entra App Registration (clientId) used by Function App EasyAuth (Azure Active Directory provider) to validate AAD tokens for narrator/Foundry calls.')
param functionAppAadClientId string = '3b67761b-d23a-423b-a8c4-c2b003c31db1'

@description('Identifier URI (audience) for the Function App AAD protected surface. Must match an identifier URI configured on the Entra App Registration.')
param functionAppAadIdentifierUri string = 'api://${tenant().tenantId}/shifting-atlas-api'

@description('Comma-separated list of allowed client app IDs for MCP tool access. Each caller must have the Narrator app role assigned.')
param mcpAllowedClientAppIds string = functionAppAadClientId

@description('Enable GPT-4o model deployment in Foundry. Set to false to skip model deployment (cost savings).')
param enableOpenAI bool = true

@description('Primary model deployment name (e.g., prod).')
param openAiPrimaryDeploymentName string = 'prod'

@description('Primary OpenAI model name (e.g., gpt-4o, gpt-35-turbo).')
param openAiPrimaryModelName string = 'gpt-35-turbo'

@description('Primary OpenAI model version.')
param openAiPrimaryModelVersion string = '2024-08-06'

@description('Primary OpenAI model capacity (TPM in thousands).')
param openAiPrimaryModelCapacity int = 10

@description('Azure OpenAI API version to use for SDK calls.')
param openAiApiVersion string = '2024-10-21'

var storageName = toLower('st${name}${unique}')
var foundryMcpTarget = !empty(foundryMcpTargetOverride)
  ? foundryMcpTargetOverride
  : 'https://${backendFunctionApp.properties.defaultHostName}/mcp'

// Azure AI Foundry (Cognitive Services AIServices) account.
// Use AVM for new resource types when available.
module foundryAccountModule 'br/public:avm/res/cognitive-services/account:0.14.1' = {
  name: 'foundry-account-${unique}'
  params: {
    name: foundryAccountName
    kind: 'AIServices'
    sku: 'S0'
    location: foundryLocation
    allowProjectManagement: true
    customSubDomainName: foundryCustomSubDomainName
    publicNetworkAccess: 'Enabled'
    managedIdentities: {
      systemAssigned: true
    }
    enableTelemetry: false
  }
}

// Reference to the Foundry account for child resources and RBAC (created by the module)
resource foundryAccount 'Microsoft.CognitiveServices/accounts@2024-10-01' existing = {
  name: foundryAccountName

  // Azure AI Foundry project (nested)
  resource project 'projects@2025-06-01' = {
    name: foundryProjectName
    location: foundryLocation
    identity: {
      type: 'SystemAssigned'
    }
    properties: {
      displayName: 'The Shifting Atlas'
      description: 'Foundry project for The Shifting Atlas (MCP-enabled)'
    }

    // Project connection to the existing MCP server hosted in the Function App (nested)
    resource mcpConnection 'connections@2025-06-01' = {
      name: foundryMcpConnectionName
      properties: {
        // Use Entra ID auth with the project/workspace managed identity.
        // (This avoids categories/authTypes that require an explicit credentials payload.)
        authType: 'AAD'
        category: 'GenericHttp'
        target: foundryMcpTarget
        useWorkspaceManagedIdentity: true
      }
    }
  }

  // GPT-4o model deployment within Azure AI Foundry (optional, nested)
  // Deploys directly to the Foundry account for unified management
  resource gpt4oDeployment 'deployments@2024-10-01' = if (enableOpenAI) {
    name: openAiPrimaryDeploymentName
    sku: {
      name: 'Standard'
      capacity: openAiPrimaryModelCapacity
    }
    properties: {
      model: {
        format: 'OpenAI'
        name: openAiPrimaryModelName
        version: openAiPrimaryModelVersion
      }
    }
  }
}

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

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${name}-${unique}'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

resource applicationInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${name}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspace.id
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
        version: '22'
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
      COSMOS_SQL_CONTAINER_PROCESSED_EVENTS: 'processedEvents'
      COSMOS_SQL_CONTAINER_DEADLETTERS: 'deadLetters'
      COSMOS_SQL_CONTAINER_EXIT_HINT_DEBOUNCE: 'exitHintDebounce'
      COSMOS_SQL_CONTAINER_TEMPORAL_LEDGER: 'temporalLedger'
      COSMOS_SQL_CONTAINER_WORLD_CLOCK: 'worldClock'
      COSMOS_SQL_CONTAINER_LOCATION_CLOCKS: 'locationClocks'
      COSMOS_SQL_CONTAINER_LORE_FACTS: 'loreFacts'
      COSMOS_SQL_DATABASE_TEST: 'game-test'

      // MCP authentication allow-list
      MCP_ALLOWED_CLIENT_APP_IDS: mcpAllowedClientAppIds

      // Azure OpenAI Configuration (uses Foundry account for unified management)
      AZURE_OPENAI_ENDPOINT: enableOpenAI ? foundryAccountModule.outputs.endpoint : ''
      AZURE_OPENAI_DEPLOYMENT_HERO_PROSE: enableOpenAI ? openAiPrimaryDeploymentName : ''
      AZURE_OPENAI_API_VERSION: openAiApiVersion
    }
  }

  // App Service Authentication (EasyAuth) configuration.
  // Notes:
  // - We keep requireAuthentication=false because some endpoints are intentionally anonymous (guest bootstrap, move, look).
  // - We set unauthenticatedClientAction=Return401 to avoid browser-login redirects for API calls.
  // - Keep providers lean: AzureStaticWebApps for frontend traffic + AzureAD for Foundry / narrators.
  resource authSettingsV2 'config@2023-12-01' = {
    name: 'authsettingsV2'
    properties: {
      platform: {
        enabled: true
        runtimeVersion: 'v2'
      }
      globalValidation: {
        requireAuthentication: false
        unauthenticatedClientAction: 'RedirectToLoginPage'
        // Exclude MCP endpoints from Easy Auth - fully anonymous access.
        // MCP extension also configured with webhookAuthorizationLevel: Anonymous in host.json.
        // TODO: Implement proper authentication (issue #774).
        excludedPaths: [
          '/runtime/webhooks/mcp'
          '/runtime/webhooks/mcp/*'
        ]
      }
      httpSettings: {
        forwardProxy: {
          convention: 'NoProxy'
        }
        requireHttps: true
        routes: {
          apiPrefix: '/.auth'
        }
      }
      identityProviders: {
        azureStaticWebApps: {
          enabled: true
          registration: {
            // Match the SWA client id shown in authsettingsV2 today.
            clientId: staticSite.properties.defaultHostname
          }
        }
        azureActiveDirectory: {
          enabled: true
          login: {
            disableWWWAuthenticate: false
          }
          registration: {
            // AAD issuer in the current tenant (v2)
            openIdIssuer: '${environment().authentication.loginEndpoint}${tenant().tenantId}/v2.0'
            clientId: functionAppAadClientId
          }
          validation: {
            // Accept tokens minted for either the app's identifier URI or the appId itself.
            allowedAudiences: [
              functionAppAadIdentifierUri
              functionAppAadClientId
            ]
            defaultAuthorizationPolicy: {
              allowedPrincipals: {}
            }
            jwtClaimChecks: {}
          }
        }

        // Disable unused providers (reduce surprise auth flows / misconfig).
        apple: {
          enabled: false
          login: {}
          registration: {}
        }
        facebook: {
          enabled: false
          login: {}
          registration: {}
        }
        gitHub: {
          enabled: false
          login: {}
          registration: {}
        }
        google: {
          enabled: false
          login: {}
          registration: {}
          validation: {}
        }
        legacyMicrosoftAccount: {
          enabled: false
          login: {}
          registration: {}
          validation: {}
        }
        twitter: {
          enabled: false
          registration: {}
        }
      }
      login: {
        allowedExternalRedirectUrls: []
        cookieExpiration: {
          convention: 'FixedTime'
          timeToExpiration: '08:00:00'
        }
        nonce: {
          nonceExpirationInterval: '00:05:00'
          validateNonce: true
        }
        preserveUrlFragmentsForLogins: false
        routes: {}
        tokenStore: {
          azureBlobStorage: {}
          enabled: false
          fileSystem: {}
          tokenRefreshExtensionHours: 72
        }
      }
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

    resource sqlProcessedEvents 'containers' = {
      name: 'processedEvents'
      properties: {
        resource: {
          id: 'processedEvents'
          partitionKey: {
            paths: ['/idempotencyKey']
            kind: 'Hash'
            version: 2
          }
          defaultTtl: 604800 // 7 days in seconds (7 * 24 * 60 * 60)
        }
        options: {}
      }
    }

    // Exit Hint Debounce container (per-player throttling) - PK: /scopeKey, per-item TTL enabled
    resource sqlExitHintDebounce 'containers' = {
      name: 'exitHintDebounce'
      properties: {
        resource: {
          id: 'exitHintDebounce'
          partitionKey: {
            paths: ['/scopeKey']
            kind: 'Hash'
            version: 2
          }
          defaultTtl: -1 // Enable per-item TTL (ttl property)
        }
        options: {}
      }
    }

    // Dead Letters container (stores failed world events) - partition key constant value 'deadletter'
    resource sqlDeadLetters 'containers' = {
      name: 'deadLetters'
      properties: {
        resource: {
          id: 'deadLetters'
          partitionKey: {
            paths: ['/partitionKey']
            kind: 'Hash'
            version: 2
          }
        }
        options: {}
      }
    }

    // Temporal Ledger container (immutable audit log for temporal events)
    resource sqlTemporalLedger 'containers' = {
      name: 'temporalLedger'
      properties: {
        resource: {
          id: 'temporalLedger'
          partitionKey: {
            paths: ['/scopeKey']
            kind: 'Hash'
            version: 2
          }
          defaultTtl: 7776000 // 90 days in seconds (90 * 24 * 60 * 60)
        }
        options: {}
      }
    }

    // World Clock container (single logical document; global tick state)
    resource sqlWorldClock 'containers' = {
      name: 'worldClock'
      properties: {
        resource: {
          id: 'worldClock'
          partitionKey: {
            paths: ['/id']
            kind: 'Hash'
            version: 2
          }
        }
        options: {}
      }
    }

    // Location Clocks container (per-location anchors)
    resource sqlLocationClocks 'containers' = {
      name: 'locationClocks'
      properties: {
        resource: {
          id: 'locationClocks'
          partitionKey: {
            paths: ['/id']
            kind: 'Hash'
            version: 2
          }
        }
        options: {}
      }
    }

    // Lore Facts container (canonical world lore facts for MCP)
    resource sqlLoreFacts 'containers' = {
      name: 'loreFacts'
      properties: {
        resource: {
          id: 'loreFacts'
          partitionKey: {
            paths: ['/type']
            kind: 'Hash'
            version: 2
          }
          indexingPolicy: {
            indexingMode: 'consistent'
            includedPaths: [
              {
                // Cosmos DB requires the root path to be explicitly included when overriding includedPaths.
                path: '/*'
              }
              {
                path: '/factId/?'
              }
              {
                path: '/type/?'
              }
              {
                path: '/createdUtc/?'
              }
            ]
            excludedPaths: [
              {
                path: '/fields/*'
              }
            ]
          }
        }
        options: {}
      }
    }
  }

  // Dedicated test database mirroring production containers for isolation of integration/E2E tests
  resource sqlDbTest 'sqlDatabases' = {
    name: 'game-test'
    properties: {
      resource: {
        id: 'game-test'
      }
      options: {}
    }

    resource sqlPlayersTest 'containers' = {
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

    resource sqlInventoryTest 'containers' = {
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

    resource sqlLayersTest 'containers' = {
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

    resource sqlEventsTest 'containers' = {
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

    resource sqlProcessedEventsTest 'containers' = {
      name: 'processedEvents'
      properties: {
        resource: {
          id: 'processedEvents'
          partitionKey: {
            paths: ['/idempotencyKey']
            kind: 'Hash'
            version: 2
          }
          defaultTtl: 604800
        }
        options: {}
      }
    }

    resource sqlExitHintDebounceTest 'containers' = {
      name: 'exitHintDebounce'
      properties: {
        resource: {
          id: 'exitHintDebounce'
          partitionKey: {
            paths: ['/scopeKey']
            kind: 'Hash'
            version: 2
          }
          defaultTtl: -1
        }
        options: {}
      }
    }

    resource sqlDeadLettersTest 'containers' = {
      name: 'deadLetters'
      properties: {
        resource: {
          id: 'deadLetters'
          partitionKey: {
            paths: ['/partitionKey']
            kind: 'Hash'
            version: 2
          }
        }
        options: {}
      }
    }

    resource sqlTemporalLedgerTest 'containers' = {
      name: 'temporalLedger'
      properties: {
        resource: {
          id: 'temporalLedger'
          partitionKey: {
            paths: ['/scopeKey']
            kind: 'Hash'
            version: 2
          }
          defaultTtl: 7776000 // 90 days in seconds (90 * 24 * 60 * 60)
        }
        options: {}
      }
    }

    resource sqlWorldClockTest 'containers' = {
      name: 'worldClock'
      properties: {
        resource: {
          id: 'worldClock'
          partitionKey: {
            paths: ['/id']
            kind: 'Hash'
            version: 2
          }
        }
        options: {}
      }
    }

    resource sqlLocationClocksTest 'containers' = {
      name: 'locationClocks'
      properties: {
        resource: {
          id: 'locationClocks'
          partitionKey: {
            paths: ['/id']
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
    properties: {
      maxDeliveryCount: 5
      lockDuration: 'PT30S'
      defaultMessageTimeToLive: 'P7D'
      deadLetteringOnMessageExpiration: true
    }
  }

  resource exitGenerationHintsQueue 'queues' = {
    name: 'exit-generation-hints'
    properties: {
      maxDeliveryCount: 5
      lockDuration: 'PT30S'
      defaultMessageTimeToLive: 'P7D'
      deadLetteringOnMessageExpiration: true
    }
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
// Using Cosmos DB data plane RBAC (sqlRoleAssignments) for data access.
// Built-in role IDs: Reader = 00000000-0000-0000-0000-000000000001, Contributor = 00000000-0000-0000-0000-000000000002
resource cosmosGraphDataContrib 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2025-04-15' = {
  name: guid(cosmosGraphAccount.id, backendFunctionApp.id, 'cosmos-graph-data-contrib')
  parent: cosmosGraphAccount
  properties: {
    roleDefinitionId: '${cosmosGraphAccount.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002' // Cosmos DB Built-in Data Contributor
    principalId: backendFunctionApp.identity.principalId
    scope: cosmosGraphAccount.id
  }
}

resource cosmosSqlDataContrib 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2025-04-15' = {
  name: guid(cosmosSqlAccount.id, backendFunctionApp.id, 'cosmos-sql-data-contrib')
  parent: cosmosSqlAccount
  properties: {
    roleDefinitionId: '${cosmosSqlAccount.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002' // Cosmos DB Built-in Data Contributor
    principalId: backendFunctionApp.identity.principalId
    scope: cosmosSqlAccount.id
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

resource storageQueueDataContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, backendFunctionApp.id, 'storage-queue-data-contributor')
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '974c5e8b-45b9-4653-ba55-5f855dd0fb88'
    ) // Storage Queue Data Contributor
    principalId: backendFunctionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource storageQueueDataMessageProcessor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, backendFunctionApp.id, 'storage-queue-data-message-processor')
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '8a0f0c08-91a1-4084-bc3d-661d67233fed'
    ) // Storage Queue Data Message Processor
    principalId: backendFunctionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Role assignment: Grant Function App access to Foundry for OpenAI (Cognitive Services OpenAI User)
// Only created when enableOpenAI is true
resource foundryOpenAiUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableOpenAI) {
  name: guid(foundryAccount.id, backendFunctionApp.id, 'foundry-openai-user')
  scope: foundryAccount
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
    ) // Cognitive Services OpenAI User
    principalId: backendFunctionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
  dependsOn: [
    foundryAccountModule
  ]
}

// Workbook: Player Operations Dashboard (consolidated movement + performance metrics)
module workbookPlayerOperations 'workbook-player-operations-dashboard.bicep' = {
  name: 'workbook-player-operations-dashboard'
  params: {
    name: name
    location: location
    applicationInsightsId: applicationInsights.id
  }
}

// Workbook: SQL API Partition Monitoring Dashboard (hot partition troubleshooting)
module workbookSqlPartitionMonitoring 'workbook-sql-partition-monitoring-dashboard.bicep' = {
  name: 'workbook-sql-partition-monitoring-dashboard'
  params: {
    name: name
    location: location
    applicationInsightsId: applicationInsights.id
  }
}

// Alert: Composite Partition Pressure (RU + 429 + Latency)
// Issue #294: Multi-signal alert for partition pressure escalation
// Replaced complex KQL query with Action Group correlation (alert processing rule)
module actionGroupPartitionPressure 'action-group-partition-pressure.bicep' = {
  name: 'action-group-partition-pressure'
  params: {
    name: name
    emailReceivers: [] // Configure via parameter override or portal
    webhookReceivers: []
    enabled: true
  }
}

// Alert: Sustained High RU Utilization
// References ADR-002 partition pressure thresholds (>70% sustained RU consumption)
module alertRuUtilization 'alert-ru-utilization.bicep' = {
  name: 'alert-ru-utilization'
  params: {
    name: name
    location: location
    applicationInsightsId: applicationInsights.id
    provisionedRuPerSecond: 400 // Matches Gremlin graph throughput
    enabled: true
    actionGroupId: actionGroupPartitionPressure.outputs.actionGroupId
  }
}

// Alert: SQL API Hot Partition Detection (Issue #387)
// Detects hot partitions when single partition consumes >80% of total container RU
// Suppresses alerts for new containers (<1000 operations) to avoid bootstrap false positives
module alertSqlHotPartition 'alert-sql-hot-partition.bicep' = {
  name: 'alert-sql-hot-partition'
  params: {
    name: name
    location: location
    applicationInsightsId: applicationInsights.id
    actionGroupId: actionGroupPartitionPressure.outputs.actionGroupId
    hotPartitionThreshold: 80
    resolutionThreshold: 70
    minDocumentCount: 1000
  }
}

// Operation Latency Monitoring Alerts (Issue #295)
// CONSOLIDATED: 10 alerts → 2 alerts (83% query reduction, ~$10-15/month savings)
// Monitors P95 latency for non-movement Gremlin operations
// Alerts when any operation exceeds threshold; shows all affected operations in payload
module operationLatencyAlerts 'alerts-operation-latency-consolidated.bicep' = {
  name: 'alerts-operation-latency'
  params: {
    applicationInsightsId: applicationInsights.id
    location: location
    actionGroupId: actionGroupPartitionPressure.outputs.actionGroupId
  }
}

output cosmosSqlTestDatabaseName string = 'game-test'

output foundryAccountName string = foundryAccountName
output foundryProjectName string = foundryProjectName
output foundryMcpConnectionName string = foundryMcpConnectionName
output foundryMcpTarget string = foundryMcpTarget
output functionAppAadClientId_out string = functionAppAadClientId
output functionAppAadIdentifierUri_out string = functionAppAadIdentifierUri

// Azure OpenAI outputs (consolidated in Foundry)
output openAiEnabled bool = enableOpenAI
output openAiEndpoint string = enableOpenAI ? foundryAccountModule.outputs.endpoint : ''
output openAiAccountName string = enableOpenAI ? foundryAccountName : ''
output openAiPrimaryDeploymentName string = enableOpenAI ? openAiPrimaryDeploymentName : ''
