// Log Analytics for the core's logs (T030; R12, PT-14): 30 days' retention. A daily ingestion cap
// keeps the month inside the free 5 GB even if something floods the log (an attack on a public
// endpoint logs a security event per refusal); when the cap is reached, ingestion stops until the
// next day.

@description('The Azure region.')
param location string

@description('The prefix of every resource name.')
param namePrefix string

@description('Days the logs are kept (PT-14).')
param retentionInDays int = 30

@description('The most the workspace takes in a day, in GB; 0.15 a day stays under 5 GB a month.')
param dailyQuotaGb string = '0.15'

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

@description('The workspace the core sends its logs to.')
output workspaceId string = workspace.id
