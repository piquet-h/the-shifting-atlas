@description('Name prefix for resources')
param name string = 'atlas'

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Application Insights resource ID to link the workbook to')
param applicationInsightsId string

// Dual Persistence workbook DECOMMISSIONED (ADR-004): Player migration & fallback monitoring removed.
// Placeholder retained temporarily; safe to delete after PR2.
var workbookId = guid('deprecated-player-store-cutover', name)
var workbookDisplayName = 'DECOMMISSIONED Dual Persistence Workbook'

resource workbook 'Microsoft.Insights/workbooks@2023-06-01' = {
  name: workbookId
  location: location
  kind: 'shared'
  properties: {
    displayName: workbookDisplayName
    // Workbook content removed (dual persistence retired)
    serializedData: '"{}"'
    sourceId: applicationInsightsId
    category: 'tsg'
    version: '1.0'
    tags: [
      'M2-Observability'
      'Deprecated'
    ]
  }
}

output workbookId string = workbook.id
output workbookGuid string = workbook.name
output workbookDisplayName string = workbook.properties.displayName
