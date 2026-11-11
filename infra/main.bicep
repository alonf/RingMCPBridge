// The core's Azure resources (T030; R11, R12, R13, DO1, DO6, PT-03, PT-14): App Service B1 Linux
// running the core's container, Azure SQL Database Basic, Blob storage, Key Vault, the core's
// user-assigned managed identity, and Log Analytics, in Israel Central. Deployed into an existing
// resource group by the deploy workflow (T032), after a what-if on each pull request.
//
// - **Owner values** (IDs, names, the registry) are parameters. The committed
//   `main.example.bicepparam` holds placeholders only; the real values stay in a git-ignored
//   `*.local.bicepparam`, or in the GitHub environment.
// - **Role definition ids** are parameters too, looked up by role name at deploy time, so no GUID
//   is committed (PT-13).
// - **No deploy creates or writes a secret value** (PT-03, DRIFT-001-05).
// - **Expected cost**: about $23 a month (agent-derived, research.md "Cost"): App Service B1 about
//   $14.45, SQL Basic about $6.46, Log Analytics inside its free allowance (capped daily), Blob and
//   Key Vault cents, the network $0.
// - **Left to the owner's runbook (T031)**: AcrPull on the registry for the core's identity, the
//   core's database user, and the first signing key.

targetScope = 'resourceGroup'

@description('The Azure region.')
param location string = 'israelcentral'

@description('The prefix of every resource name: lowercase letters, digits and hyphens.')
@minLength(3)
@maxLength(12)
param namePrefix string = 'ringbridge'

@description('The owner\'s existing container registry, by name (it stays outside this deployment).')
param registryName string

@description('The image\'s repository in the registry.')
param imageName string = 'ring-mcp-bridge'

@description('The image tag to run, set by the deploy.')
param imageTag string

@description('The core\'s public origin, `https://<host>`. Empty uses the host name Azure gives the app.')
param publicUrl string = ''

@description('The core\'s log level.')
@allowed([
  'debug'
  'info'
  'warn'
  'error'
])
param logLevel string = 'info'

@description('The directory (tenant) id the owner signs in through.')
param entraTenantId string = subscription().tenantId

@description('The bridge\'s Entra app registration: its client id.')
param entraClientId string

@description('The owner\'s Entra object id: the only account that may sign in.')
param ownerObjectId string

@description('The display name of the SQL break-glass group, the SQL server\'s Entra admin.')
param sqlAdminGroupName string

@description('The object id of the SQL break-glass group.')
param sqlAdminGroupObjectId string

@description('The listed agents, as JSON: client ids, redirect URIs and scopes (PT-18).')
param agents string = '[]'

@description('New agent registrations accepted an hour; empty leaves the core\'s default of 10.')
param registrationsPerHour string = ''

@description('The role definition id of Key Vault Secrets User, looked up by name at deploy time.')
param keyVaultReaderRoleId string

@description('The role definition id of Storage Blob Data Contributor, looked up by name at deploy time.')
param storageBlobDataContributorRoleId string

// Globally unique names share one suffix, stable for this resource group.
var suffix = take(uniqueString(resourceGroup().id), 6)
var appName = '${namePrefix}-${suffix}'

resource coreIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${namePrefix}-core'
  location: location
}

module network 'modules/network.bicep' = {
  name: 'network'
  params: {
    location: location
    namePrefix: namePrefix
  }
}

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    location: location
    namePrefix: namePrefix
  }
}

module keyVault 'modules/key-vault.bicep' = {
  name: 'key-vault'
  params: {
    location: location
    name: '${namePrefix}-kv-${suffix}'
    readerPrincipalId: coreIdentity.properties.principalId
    readerRoleId: keyVaultReaderRoleId
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  params: {
    location: location
    name: take('${replace(namePrefix, '-', '')}${uniqueString(resourceGroup().id)}', 24)
    contributorPrincipalId: coreIdentity.properties.principalId
    blobDataContributorRoleId: storageBlobDataContributorRoleId
  }
}

module sql 'modules/sql.bicep' = {
  name: 'sql'
  params: {
    location: location
    serverName: '${namePrefix}-sql-${suffix}'
    databaseName: 'bridge'
    appSubnetId: network.outputs.appSubnetId
    adminGroupName: sqlAdminGroupName
    adminGroupObjectId: sqlAdminGroupObjectId
  }
}

module appService 'modules/app-service.bicep' = {
  name: 'app-service'
  params: {
    location: location
    namePrefix: namePrefix
    appName: appName
    identityId: coreIdentity.id
    identityClientId: coreIdentity.properties.clientId
    appSubnetId: network.outputs.appSubnetId
    workspaceId: monitoring.outputs.workspaceId
    registryName: registryName
    imageName: imageName
    imageTag: imageTag
    publicUrl: publicUrl
    logLevel: logLevel
    sqlServerHostName: sql.outputs.serverHostName
    sqlDatabaseName: sql.outputs.databaseName
    keyVaultUrl: keyVault.outputs.vaultUri
    entraTenantId: entraTenantId
    entraClientId: entraClientId
    ownerObjectId: ownerObjectId
    agents: agents
    registrationsPerHour: registrationsPerHour
  }
}

@description('The core\'s public origin; the smoke test calls `/readyz` and `get_health` under it.')
output publicUrl string = appService.outputs.publicUrl

@description('The web app\'s name, for the deploy and the runbook.')
output appName string = appName

@description('The core identity\'s name: the runbook grants it AcrPull and creates its database user.')
output coreIdentityName string = coreIdentity.name

@description('The core identity\'s principal id, for the runbook\'s AcrPull grant.')
output coreIdentityPrincipalId string = coreIdentity.properties.principalId

@description('The Key Vault, where the owner sets the first signing key.')
output keyVaultName string = keyVault.outputs.vaultName

@description('The SQL server\'s host name, for the runbook\'s database user.')
output sqlServerHostName string = sql.outputs.serverHostName
