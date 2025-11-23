@description('Name prefix for resources')
param name string = 'atlas'

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Application Insights resource ID to link the workbook to')
param applicationInsightsId string

// Consolidated Player Operations Dashboard (Movement + Gremlin Performance)
// Replaces: movement-navigation & performance-operations dashboards (post-cutover simplification)
// Tags retain observability milestone references.
var workbookId = guid('player-operations-dashboard', name)
var workbookDisplayName = 'Player Operations Dashboard'

resource workbook 'Microsoft.Insights/workbooks@2023-06-01' = {
  name: workbookId
  location: location
  kind: 'shared'
  properties: {
    displayName: workbookDisplayName
    serializedData: string(loadJsonContent('./workbooks/player-operations-dashboard.workbook.json'))
    sourceId: applicationInsightsId
    category: 'tsg'
    version: '1.0'
    tags: [
      'M2-Observability'
      'Navigation'
      'Performance'
      'RU'
      'Latency'
      'Consolidated'
    ]
  }
}

output workbookId string = workbook.id
output workbookGuid string = workbook.name
output workbookDisplayName string = workbook.properties.displayName
