@description('Name prefix for resources')
param name string = 'atlas'

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Application Insights resource ID to link the workbook to')
param applicationInsightsId string

// Agent Sandbox workbook
// Operational view for autonomous agent behavior: decision latency, proposal acceptance/rejection,
// applied effects by type, and DLQ/replay activity. Covers Agent.Step.*, Agent.Proposal.*,
// Agent.Effect.Applied, and World.Event.DeadLettered telemetry (issues #700, #907).
var workbookId = guid('agent-sandbox-dashboard', name)
var workbookDisplayName = 'Agent Sandbox Dashboard'

resource workbook 'Microsoft.Insights/workbooks@2023-06-01' = {
  name: workbookId
  location: location
  kind: 'shared'
  properties: {
    displayName: workbookDisplayName
    serializedData: string(loadJsonContent('./workbooks/agent-sandbox-dashboard.workbook.json'))
    sourceId: applicationInsightsId
    category: 'tsg'
    version: '1.0'
    tags: [
      'M4c-AgentSandbox'
      'Agent'
      'Latency'
      'Proposals'
      'Effects'
      'DLQ'
    ]
  }
}

output workbookId string = workbook.id
output workbookGuid string = workbook.name
output workbookDisplayName string = workbook.properties.displayName
