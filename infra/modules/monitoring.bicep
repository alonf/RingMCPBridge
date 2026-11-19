// Log Analytics for the core's logs (T030; R12, PT-14): 30 days' retention. A daily ingestion cap
// bounds the cost if something floods the log (an attack on a public endpoint logs a security
// event per refusal): 0.05 GB a day is about 5 times the expected volume (0.1 to 0.3 GB a month),
// and at most about 1.55 GB a month, about $5 even with no free allowance left on the billing
// account (agent-derived, $3.29 per GB). When the cap is reached, ingestion stops until the next
// day.

@description('The Azure region.')
param location string

@description('The prefix of every resource name.')
param namePrefix string

@description('Days the logs are kept (PT-14).')
param retentionInDays int = 30

@description('The most the workspace takes in a day, in GB.')
param dailyQuotaGb string = '0.05'

param appResourceId string

@secure()
param alertEmail string

@secure()
param alertSmsCountryCode string

@secure()
param alertSmsNumber string

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${namePrefix}-logs'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: retentionInDays
    workspaceCapping: {
      dailyQuotaGb: json(dailyQuotaGb)
    }
  }
}

resource contacts 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: '${namePrefix}-owner'
  location: 'global'
  properties: {
    groupShortName: 'RingBridge'
    enabled: true
    emailReceivers: [
      { name: 'Owner email', emailAddress: alertEmail, useCommonAlertSchema: true }
    ]
    smsReceivers: [
      { name: 'Owner SMS', countryCode: alertSmsCountryCode, phoneNumber: alertSmsNumber }
    ]
  }
}

// summarize without a grouping key returns one row even when the core is silent.
var healthQuery = replace(loadTextContent('bridge-health.kql'), '__APP_RESOURCE_ID__', appResourceId)
resource healthAlert 'Microsoft.Insights/scheduledQueryRules@2023-12-01' = {
  name: '${namePrefix}-bridge-health'
  location: location
  kind: 'LogAlert'
  properties: {
    displayName: 'Ring bridge health'
    description: 'Core heartbeat missing, home offline, event backlog delayed, or Ring sign-in lost.'
    severity: 2
    enabled: true
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    scopes: [workspace.id]
    // On the first deployment the application and its console log table do not exist yet.
    skipQueryValidation: true
    criteria: {
      allOf: [
        {
          query: healthQuery
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: { numberOfEvaluationPeriods: 1, minFailingPeriodsToAlert: 1 }
        }
      ]
    }
    autoMitigate: true
    actions: { actionGroups: [contacts.id] }
  }
}

@description('The workspace the core sends its logs to.')
output workspaceId string = workspace.id
