// The core's Blob storage (T030; R12, DO6): for media (iteration 003) and the write-once audit copy
// (iteration 004). Event media uses the private media container and the core's managed identity.

@description('The Azure region.')
param location string

@description('The account name: 3 to 24 lowercase letters and digits, globally unique.')
param name string

@description('The core identity\'s principal id, which reads and writes blobs.')
param contributorPrincipalId string

@description('The role definition id of Storage Blob Data Contributor, looked up by name at deploy time.')
param blobDataContributorRoleId string

resource account 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: name
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Enabled'
  }
}

resource blobs 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' existing = {
  parent: account
  name: 'default'
}

resource media 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobs
  name: 'media'
  properties: { publicAccess: 'None' }
}

resource blobDataContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(account.id, contributorPrincipalId, blobDataContributorRoleId)
  scope: account
  properties: {
    principalId: contributorPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobDataContributorRoleId)
  }
}

@description('The account\'s name.')
output accountName string = account.name
