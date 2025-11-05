@description('Name prefix for resources')
param name string = 'atlas'

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Application Insights resource ID to link the workbook to')
param applicationInsightsId string

var workbookName = 'movement-success-rate-${name}'
var workbookDisplayName = 'Movement Success Rate'

resource workbook 'Microsoft.Insights/workbooks@2023-06-01' = {
  name: workbookName
  location: location
  kind: 'shared'
  properties: {
    displayName: workbookDisplayName
    serializedData: string(loadJsonContent('../docs/observability/workbooks/movement-success-rate.workbook.json'))
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
