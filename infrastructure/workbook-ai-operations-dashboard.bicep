@description('Name prefix for resources')
param name string = 'atlas'

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Application Insights resource ID to link the workbook to')
param applicationInsightsId string

// AI Operations workbook
// Operational view for LLM-backed features and MCP (hero prose generation + MCP tool pipeline)
var workbookId = guid('ai-operations-dashboard', name)
var workbookDisplayName = 'AI Operations Dashboard'

resource workbook 'Microsoft.Insights/workbooks@2023-06-01' = {
  name: workbookId
  location: location
  kind: 'shared'
  properties: {
    displayName: workbookDisplayName
    serializedData: string(loadJsonContent('./workbooks/ai-operations-dashboard.workbook.json'))
    sourceId: applicationInsightsId
    category: 'tsg'
    version: '1.0'
    tags: [
      'M5-Observability'
      'AI'
      'OpenAI'
      'HeroProse'
      'MCP'
    ]
  }
}

output workbookId string = workbook.id
output workbookGuid string = workbook.name
output workbookDisplayName string = workbook.properties.displayName
