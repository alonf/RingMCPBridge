// The core's Key Vault (T030; R12, PT-03, DO6). Access is by Azure RBAC only. The deploy creates
// no secret and writes no secret value: until the owner sets `issuer-signing-keys` (the bootstrap's
// signing-key step, T031), the core's `/readyz` reports not ready and names it.
//
// The core's identity reads secrets (Key Vault Secrets User, on the vault). Nothing in the core
// writes a secret yet, so it has no Secrets Officer role; that arrives with the signing-key
// rotation. Purge protection is left off: turning it on cannot be undone, so it is the owner's
// choice.

@description('The Azure region.')
param location string

@description('The vault name: 3 to 24 letters, digits and hyphens, globally unique.')
param name string

@description('The core identity\'s principal id, which reads the secrets.')
param readerPrincipalId string

@description('The role definition id of Key Vault Secrets User, looked up by name at deploy time.')
param readerRoleId string

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: name
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    publicNetworkAccess: 'Enabled'
  }
}

resource secretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, readerPrincipalId, readerRoleId)
  scope: vault
  properties: {
    principalId: readerPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', readerRoleId)
  }
}

@description('The vault\'s URL, `https://<vault>.vault.azure.net/`.')
output vaultUri string = vault.properties.vaultUri

@description('The vault\'s name.')
output vaultName string = vault.name
