@description('Name prefix for resources')
param name string = 'atlas'

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Application Insights resource ID to link the workbook to')
param applicationInsightsId string

var workbookName = 'movement-blocked-reasons-${name}'
var workbookDisplayName = 'Movement Blocked Reasons Breakdown'

resource workbook 'Microsoft.Insights/workbooks@2023-06-01' = {
  name: guid(resourceGroup().id, workbookName)
  location: location
  kind: 'shared'
  properties: {
    displayName: workbookDisplayName
    serializedData: string(loadJsonContent('../docs/observability/workbooks/movement-blocked-reasons.workbook.json'))
    sourceId: applicationInsightsId
    category: 'tsg'
    version: '1.0'
    tags: [
      'M2-Observability'
      'Navigation'
      'Telemetry'
    ]
  }
}

output workbookId string = workbook.id
output workbookName string = workbook.name
