// The core's Blob storage (T030; R12, DO6): for media (iteration 003) and the write-once audit copy
// (iteration 004). Only the account is created here; its containers, their lifetimes and the WORM
// lock arrive with those features. Access is by the core's identity only: no shared keys and no
// public blobs.

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
