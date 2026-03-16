@description('Name prefix for resources')
param name string = 'atlas'

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Application Insights resource ID for alert')
param applicationInsightsId string

@description('Action group ID for alert notifications (optional)')
param actionGroupId string = ''

@description('Number of agent dead-letter entries per evaluation window that triggers the alert')
param dlqCountThreshold int = 5

@description('Alert evaluation frequency in minutes')
param evaluationFrequencyMinutes int = 5

@description('Alert severity (0=Critical, 1=Error, 2=Warning, 3=Informational)')
param severity int = 2

// Alert naming
var alertName = 'agent-dlq-spike-${name}'
var alertDisplayName = 'Agent Sandbox DLQ Spike'
var alertDescription = 'Fires when World.Agent.* events exceed the dead-letter threshold in a 5-minute window, indicating agent step failures that exhausted Service Bus retries. Distinguish permanent (schema-validation, json-parse) from transient (handler-error) causes before replaying. See docs/observability/agent-failure-taxonomy.md for triage steps.'

resource agentDlqSpikeAlert 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: alertName
  location: location
  properties: {
    displayName: alertDisplayName
    description: alertDescription
    severity: severity
    enabled: true
    evaluationFrequency: 'PT${evaluationFrequencyMinutes}M'
    windowSize: 'PT${evaluationFrequencyMinutes}M'
    scopes: [
      applicationInsightsId
    ]
    targetResourceTypes: [
      'Microsoft.Insights/components'
    ]
    criteria: {
      allOf: [
        {
          query: format(
            '''
customEvents
| where timestamp > ago({0}m)
| where name == 'World.Event.DeadLettered'
| extend eventType = tostring(customDimensions['eventType'])
| where eventType startswith 'World.Agent.'
| summarize DLQCount = count()
| where DLQCount >= {1}
''',
            evaluationFrequencyMinutes,
            dlqCountThreshold
          )
          timeAggregation: 'Count'
          operator: 'GreaterThanOrEqual'
          threshold: 1
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: actionGroupId != '' ? {
      actionGroups: [
        actionGroupId
      ]
    } : {}
    autoMitigate: true
  }
}
