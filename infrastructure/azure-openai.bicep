@description('Name prefix for resources')
param name string = 'atlas'

@description('Azure region for the OpenAI resource')
param location string = resourceGroup().location

@description('Name of the model deployment (e.g., gpt-4, gpt-4o)')
param modelDeploymentName string = 'gpt-4'

@description('OpenAI model name (e.g., gpt-4, gpt-4o)')
param modelName string = 'gpt-4'

@description('Model version (e.g., 0613, 2024-05-13)')
param modelVersion string = '0613'

@description('Model deployment capacity (in thousands of tokens per minute)')
param modelCapacity int = 10

@description('SKU name for Azure OpenAI resource')
@allowed(['S0'])
param skuName string = 'S0'

@description('Principal ID of the backend Function App managed identity')
param functionAppPrincipalId string

@description('Whether to disable local (key-based) authentication')
param disableLocalAuth bool = true

// Azure OpenAI Account
resource openAIAccount 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: 'oai-${name}'
  location: location
  kind: 'OpenAI'
  sku: {
    name: skuName
  }
  properties: {
    customSubDomainName: 'oai-${name}-${uniqueString(resourceGroup().id)}'
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: disableLocalAuth
    networkAcls: {
      defaultAction: 'Allow'
    }
  }
}

// Model Deployment
resource modelDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: openAIAccount
  name: modelDeploymentName
  sku: {
    name: 'Standard'
    capacity: modelCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: modelName
      version: modelVersion
    }
    versionUpgradeOption: 'OnceCurrentVersionExpired'
  }
}

// Role Assignment: Cognitive Services OpenAI User
// Built-in role ID: 5e0bd9bd-7b93-4f28-af87-19fc36ad61bd
resource openAIUserRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(openAIAccount.id, functionAppPrincipalId, 'openai-user')
  scope: openAIAccount
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
    ) // Cognitive Services OpenAI User
    principalId: functionAppPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// Outputs
output openAIAccountName string = openAIAccount.name
output openAIEndpoint string = openAIAccount.properties.endpoint
output modelDeploymentName string = modelDeployment.name
