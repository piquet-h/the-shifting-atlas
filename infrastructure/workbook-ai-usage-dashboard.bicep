@description('Name prefix for resources')
param name string = 'atlas'

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Application Insights resource ID to link the workbook to')
param applicationInsightsId string

// AI Usage workbook
// Tracks token consumption, cost estimates, narration throughput, and prompt-template retrieval
// sourced entirely from backend-emitted telemetry in Application Insights.
//
// Telemetry constants (defined in shared/src/telemetryEvents.ts):
//   AI.Cost.*        — pre-call estimates, windowed summaries, budget warnings, capped/adjusted inputs
//   Description.Hero.* — cache outcomes + token usage from hero-prose generation
//   MCP.Tool.Invoked — narration/tool invocation counts and latency
//   PromptTemplate.Get — prompt-template retrieval with version + hash for drift detection
//
// Non-goal: world simulation metrics (agent step counts, realm counts).
// For agent pipeline telemetry see workbook-agent-sandbox-dashboard.bicep.
// For hero prose failure analysis and MCP auth/throttle see workbook-ai-operations-dashboard.bicep.
var workbookId = guid('ai-usage-dashboard', name)
var workbookDisplayName = 'AI Usage Dashboard'

resource workbook 'Microsoft.Insights/workbooks@2023-06-01' = {
  name: workbookId
  location: location
  kind: 'shared'
  properties: {
    displayName: workbookDisplayName
    serializedData: string(loadJsonContent('./workbooks/ai-usage-dashboard.workbook.json'))
    sourceId: applicationInsightsId
    category: 'tsg'
    version: '1.0'
    tags: [
      'M5a-Observability'
      'AI'
      'Cost'
      'Tokens'
      'MCP'
      'HeroProse'
      'PromptTemplate'
    ]
  }
}

output workbookId string = workbook.id
output workbookGuid string = workbook.name
output workbookDisplayName string = workbook.properties.displayName
