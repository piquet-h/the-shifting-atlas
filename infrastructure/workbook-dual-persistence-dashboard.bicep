@description('Name prefix for resources')
param name string = 'atlas'

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Application Insights resource ID to link the workbook to')
param applicationInsightsId string

// Dual Persistence Monitoring Dashboard
// Monitors player migration, write-through sync, and Gremlin fallback during SQL API migration
// Related issues: #518 (Write-Through), #519 (Feature Flag), #525 (Telemetry), #386 (Epic)
var workbookId = guid('dual-persistence-dashboard', name)
var workbookDisplayName = 'Dual Persistence Monitoring Dashboard'

resource workbook 'Microsoft.Insights/workbooks@2023-06-01' = {
  name: workbookId
  location: location
  kind: 'shared'
  properties: {
    displayName: workbookDisplayName
    serializedData: string(loadJsonContent('./workbooks/dual-persistence-dashboard.workbook.json'))
    sourceId: applicationInsightsId
    category: 'tsg'
    version: '1.0'
    tags: [
      'M2-Observability'
      'DualPersistence'
      'Migration'
      'SQL'
      'Gremlin'
    ]
  }
}

output workbookId string = workbook.id
output workbookGuid string = workbook.name
output workbookDisplayName string = workbook.properties.displayName
