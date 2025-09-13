@description('Location for all resources')
param location string = resourceGroup().location

var storageName = toLower('tsa${uniqueString(resourceGroup().id)}')

resource storage 'Microsoft.Storage/storageAccounts@2021-09-01' = {
  name: storageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
  }
}

// App Service plan for Functions (Elastic Premium or Consumption is typically used,
// but for simplicity we create a Linux Consumption-like plan via a placeholder; note: Consumption plans are implicit.)
resource hostingPlan 'Microsoft.Web/serverfarms@2021-02-01' = {
  name: 'tsa-plan-${uniqueString(resourceGroup().id)}'
  location: location
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  properties: {
    maximumElasticWorkerCount: 1
  }
}

// Website API Function App
resource websiteApi 'Microsoft.Web/sites@2021-02-01' = {
  name: 'tsa-website-api-${uniqueString(resourceGroup().id)}'
  location: location
  kind: 'functionapp,linux'
  properties: {
    serverFarmId: hostingPlan.id
    siteConfig: {
      linuxFxVersion: 'Node|20'
      appSettings: [
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '1'
        }
        {
          name: 'AzureWebJobsStorage'
          value: storage.properties.primaryEndpoints.blob
        }
      ]
    }
  }
}

// Queue Worker Function App
resource queueWorker 'Microsoft.Web/sites@2021-02-01' = {
  name: 'tsa-queue-worker-${uniqueString(resourceGroup().id)}'
  location: location
  kind: 'functionapp,linux'
  properties: {
    serverFarmId: hostingPlan.id
    siteConfig: {
      linuxFxVersion: 'Node|20'
      appSettings: [
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '1'
        }
        {
          name: 'AzureWebJobsStorage'
          value: storage.properties.primaryEndpoints.blob
        }
      ]
    }
  }
}

output storageAccountName string = storage.name
output websiteApiName string = websiteApi.name
output queueWorkerName string = queueWorker.name
