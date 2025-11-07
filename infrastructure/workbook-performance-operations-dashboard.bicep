@description('Name prefix for resources')
param name string = 'atlas'

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Application Insights resource ID to link the workbook to')
param applicationInsightsId string

// Consolidated performance operations workbook (RU & latency monitoring)
// Covers issues: #289 (RU & Latency Overview), #290 (Correlation), #291 (Partition Pressure), #296 (Success/Failure)
var workbookId = guid('performance-operations-dashboard', name)
var workbookDisplayName = 'Performance Operations Dashboard'

resource workbook 'Microsoft.Insights/workbooks@2023-06-01' = {
  name: workbookId
  location: location
  kind: 'shared'
  properties: {
    displayName: workbookDisplayName
    serializedData: string(loadJsonContent('./workbooks/performance-operations-dashboard.workbook.json'))
    sourceId: applicationInsightsId
    category: 'tsg'
    version: '1.0'
    tags: [
      'M2-Observability'
      'Performance'
      'Gremlin'
      'RU'
      'Latency'
      'PartitionPressure'
    ]
  }
}

output workbookId string = workbook.id
output workbookGuid string = workbook.name
output workbookDisplayName string = workbook.properties.displayName
