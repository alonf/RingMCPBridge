// An example of the deployment's owner values (T030; PT-05). Placeholders only: copy it to
// `main.local.bicepparam` (git-ignored), replace each `<...>`, and never commit the copy. The deploy
// workflow (T032) passes the same values from the GitHub environment instead.
using 'main.bicep'

param registryName = '<registry-name>'
param imageTag = '<image-tag>'
param entraClientId = '<entra-app-client-id>'
param ownerObjectId = '<owner-object-id>'
param sqlAdminGroupName = '<sql-break-glass-group-name>'
param sqlAdminGroupObjectId = '<sql-break-glass-group-object-id>'
// The listed agents (PT-18): [{"client_id": ..., "redirect_uris": [...], "scopes": ["read"]}]
param agents = '[]'
// Looked up by role name: az role definition list --name "Key Vault Secrets User" --query "[0].name" -o tsv
param keyVaultReaderRoleId = '<role-id-key-vault-secrets-user>'
// Looked up by role name: az role definition list --name "Storage Blob Data Contributor" --query "[0].name" -o tsv
param storageBlobDataContributorRoleId = '<role-id-storage-blob-data-contributor>'
