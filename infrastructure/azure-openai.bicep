@description('Name prefix for the Azure OpenAI account.')
param name string

@description('Azure region for the OpenAI account. Recommend: eastus, eastus2, westus, or swedencentral for availability.')
param location string

@description('Short unique suffix for globally unique OpenAI account name.')
param unique string

@description('Name of the primary model deployment (e.g., gpt-4o, gpt-35-turbo).')
param primaryDeploymentName string = 'hero-prose'

@description('Azure OpenAI model name for the primary deployment.')
param primaryModelName string = 'gpt-4o'

@description('Model version for the primary deployment.')
param primaryModelVersion string = '2024-08-06'

@description('Model capacity (tokens per minute in thousands). Default: 10K TPM.')
param primaryModelCapacity int = 10

@description('SKU for the Azure OpenAI account.')
@allowed([
  'S0'
])
param sku string = 'S0'

@description('Principal ID of the Function App managed identity to grant OpenAI User role.')
param functionAppPrincipalId string

var openAiAccountName = toLower('oai-${name}-${unique}')

// Azure OpenAI account
// Note: Prefer Azure Verified Modules when available for OpenAI
resource openAiAccount 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: openAiAccountName
  location: location
  kind: 'OpenAI'
  sku: {
    name: sku
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    customSubDomainName: openAiAccountName
    publicNetworkAccess: 'Enabled'
    // Disable local/key authentication - Azure AD (Managed Identity) only
    disableLocalAuth: true
  }
}

// Primary model deployment (e.g., for hero prose generation)
resource primaryDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: openAiAccount
  name: primaryDeploymentName
  sku: {
    name: 'Standard'
    capacity: primaryModelCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: primaryModelName
      version: primaryModelVersion
    }
  }
}

// Role assignment: Grant Function App access to Azure OpenAI (Cognitive Services OpenAI User)
resource openAiUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(openAiAccount.id, functionAppPrincipalId, 'openai-user')
  scope: openAiAccount
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
    ) // Cognitive Services OpenAI User
    principalId: functionAppPrincipalId
    principalType: 'ServicePrincipal'
  }
}

@description('Azure OpenAI account endpoint URL.')
output endpoint string = openAiAccount.properties.endpoint

@description('Azure OpenAI account name.')
output accountName string = openAiAccount.name

@description('Azure OpenAI account resource ID.')
output accountId string = openAiAccount.id

@description('Primary model deployment name.')
output primaryDeploymentName string = primaryDeployment.name

@description('System-assigned principal ID of the OpenAI account (for RBAC if needed).')
output principalId string = openAiAccount.identity.principalId
