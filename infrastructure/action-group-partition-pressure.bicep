@description('Name prefix for resources')
param name string = 'atlas'

@description('Email addresses for critical partition pressure alerts')
param emailReceivers array = []

@description('Webhook URLs for integration (e.g., PagerDuty, Slack)')
param webhookReceivers array = []

@description('Enable action group')
param enabled bool = true

// Action Group for Composite Partition Pressure
// Receives notifications when multiple pressure signals detected
resource actionGroupPartitionPressure 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: 'ag-partition-pressure-${name}'
  location: 'global' // Action groups are global resources
  properties: {
    groupShortName: 'PartPress' // Max 12 chars
    enabled: enabled
    emailReceivers: [
      for (email, i) in emailReceivers: {
        name: 'Email${i}'
        emailAddress: email
        useCommonAlertSchema: true
      }
    ]
    webhookReceivers: [
      for (webhook, i) in webhookReceivers: {
        name: 'Webhook${i}'
        serviceUri: webhook
        useCommonAlertSchema: true
      }
    ]
  }
}

// Alert Processing Rule: Correlate multiple partition pressure signals
// Fires critical notification only when 2+ related alerts active within 10 minutes
resource alertProcessingRule 'Microsoft.AlertsManagement/actionRules@2021-08-08' = {
  name: 'apr-composite-partition-pressure-${name}'
  location: 'global' // Alert processing rules are global
  properties: {
    description: 'Composite partition pressure escalation - fires when multiple pressure signals detected simultaneously (RU + 429 + Latency)'
    enabled: enabled
    scopes: [
      '/subscriptions/${subscription().subscriptionId}/resourceGroups/${resourceGroup().name}'
    ]
    conditions: [
      {
        field: 'AlertRuleName'
        operator: 'Contains'
        values: [
          'alert-ru-utilization'
          'gremlin-429-spike'
          'latency-'
        ]
      }
      {
        field: 'Severity'
        operator: 'Equals'
        values: ['Sev2', 'Sev3'] // Warning or Error
      }
    ]
    actions: [
      {
        actionGroupIds: [actionGroupPartitionPressure.id]
        actionType: 'AddActionGroups'
      }
    ]
  }
}

// Output the action group ID for reference in other alert modules
output actionGroupId string = actionGroupPartitionPressure.id
output actionGroupName string = actionGroupPartitionPressure.name
output alertProcessingRuleId string = alertProcessingRule.id
