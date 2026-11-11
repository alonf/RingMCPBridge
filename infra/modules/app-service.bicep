// The core on App Service (T030; R11, DO1, DO6): B1 Linux, one instance, Always On and WebSockets,
// running the bridge's one image in mode H's core mode, pulled from the owner's registry with the
// core's identity.
//
// - **Health check on `/readyz`**:
//   - With one instance, App Service never takes it out of rotation, whatever the check says. An
//     instance unhealthy for an hour is replaced, at most once an hour and three times a day.
//   - A process that hangs also fails `/readyz`, so the check covers what `/livez` would; App
//     Service has no second probe path.
//   - The first deploy is deliberately not ready until the owner sets `issuer-signing-keys`, so it
//     may be replaced a few times in that window; it keeps serving meanwhile.
// - **Switching to a new image is not gated on `/readyz`**: App Service starts the new container,
//   pings `/robots933456.txt` (the core answers 404, which counts as started), then sends requests
//   to it and stops the old one. That is what lets the new container take the lease the old one
//   held. `WEBSITE_WARMUP_PATH` is never set to `/readyz`, and B1 has no deployment slots to swap.
// - **Logs**: only the console (the bridge's own JSON log lines) and the platform's container
//   events go to Log Analytics. HTTP logs are off: they record query strings, which carry OAuth
//   codes on `/sign-in/return` and `/oauth/*`.
// - **Settings**: every setting the core reads is set here, or left to its recorded default (the
//   settings test checks the list). None is a secret: the secrets live in Key Vault.

@description('The Azure region.')
param location string

@description('The prefix of every resource name.')
param namePrefix string

@description('The web app\'s name, globally unique: its default host is `<name>.azurewebsites.net`.')
param appName string

@description('The core\'s user-assigned identity: its resource id.')
param identityId string

@description('The core\'s user-assigned identity: its client id.')
param identityClientId string

@description('The subnet the app integrates with.')
param appSubnetId string

@description('The Log Analytics workspace for the console and platform logs.')
param workspaceId string

@description('The owner\'s existing container registry, by name.')
param registryName string

@description('The image\'s repository in the registry.')
param imageName string

@description('The image tag to run.')
param imageTag string

@description('The core\'s public origin, `https://<host>`, with no path.')
param publicUrl string

@description('The core\'s log level.')
@allowed([
  'debug'
  'info'
  'warn'
  'error'
])
param logLevel string

@description('The Azure SQL server\'s host name.')
param sqlServerHostName string

@description('The database name.')
param sqlDatabaseName string

@description('The Key Vault URL.')
param keyVaultUrl string

@description('The directory (tenant) id the owner signs in through.')
param entraTenantId string

@description('The bridge\'s Entra app registration: its client id.')
param entraClientId string

@description('The owner\'s Entra object id: the only account that may sign in.')
param ownerObjectId string

@description('The listed agents, as JSON (PT-18).')
param agents string

@description('New agent registrations accepted an hour; empty leaves the core\'s default of 10.')
param registrationsPerHour string

// The port the image listens on (bridge/Dockerfile's EXPOSE), told to App Service and the core.
var port = '8080'

var settings = [
  { name: 'WEBSITES_PORT', value: port }
  { name: 'WEBSITES_ENABLE_APP_SERVICE_STORAGE', value: 'false' }
  { name: 'BRIDGE_MODE', value: 'core' }
  { name: 'BRIDGE_LOG_LEVEL', value: logLevel }
  { name: 'BRIDGE_PUBLIC_URL', value: publicUrl }
  { name: 'BRIDGE_PORT', value: port }
  // App Service's front end ends TLS: the core trusts its X-Forwarded-Proto, so the Issuer's
  // cookies are Secure (T027).
  { name: 'BRIDGE_TRUST_PROXY', value: 'true' }
  { name: 'BRIDGE_SQL_SERVER', value: sqlServerHostName }
  { name: 'BRIDGE_SQL_DATABASE', value: sqlDatabaseName }
  { name: 'BRIDGE_KEY_VAULT_URL', value: keyVaultUrl }
  { name: 'BRIDGE_MANAGED_IDENTITY_CLIENT_ID', value: identityClientId }
  { name: 'BRIDGE_ENTRA_TENANT_ID', value: entraTenantId }
  { name: 'BRIDGE_ENTRA_CLIENT_ID', value: entraClientId }
  { name: 'BRIDGE_OWNER_OBJECT_ID', value: ownerObjectId }
  { name: 'BRIDGE_AGENTS', value: agents }
]
var optionalSettings = empty(registrationsPerHour)
  ? []
  : [{ name: 'BRIDGE_REGISTRATIONS_PER_HOUR', value: registrationsPerHour }]

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: '${namePrefix}-plan'
  location: location
  kind: 'linux'
  sku: {
    name: 'B1'
    tier: 'Basic'
    capacity: 1
  }
  properties: {
    reserved: true
  }
}

resource app 'Microsoft.Web/sites@2024-04-01' = {
  name: appName
  location: location
  kind: 'app,linux,container'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identityId}': {}
    }
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    clientAffinityEnabled: false
    virtualNetworkSubnetId: appSubnetId
    siteConfig: {
      linuxFxVersion: 'DOCKER|${registryName}${environment().suffixes.acrLoginServer}/${imageName}:${imageTag}'
      acrUseManagedIdentityCreds: true
      acrUserManagedIdentityID: identityClientId
      alwaysOn: true
      webSocketsEnabled: true
      http20Enabled: true
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      ftpsState: 'Disabled'
      healthCheckPath: '/readyz'
      numberOfWorkers: 1
      httpLoggingEnabled: false
      detailedErrorLoggingEnabled: false
      requestTracingEnabled: false
      appSettings: concat(settings, optionalSettings)
    }
  }
}

// No publishing passwords: deploys go through the deploy identity.
resource ftpCredentials 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-04-01' = {
  parent: app
  name: 'ftp'
  properties: {
    allow: false
  }
}

resource scmCredentials 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-04-01' = {
  parent: app
  name: 'scm'
  properties: {
    allow: false
  }
}

resource logs 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'core-logs'
  scope: app
  properties: {
    workspaceId: workspaceId
    logs: [
      {
        category: 'AppServiceConsoleLogs'
        enabled: true
      }
      {
        category: 'AppServicePlatformLogs'
        enabled: true
      }
    ]
  }
}

@description('The app\'s default host name.')
output defaultHostName string = app.properties.defaultHostName
