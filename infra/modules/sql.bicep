// The core's database (T030; R12, DO6): Azure SQL Database Basic (2 GB, 5 DTU), with point-in-time
// restore for 7 days, included in its price.
// - **Sign-in**: Microsoft Entra only. The server's Entra admin is the empty break-glass group the
//   owner made once (PT-06); no SQL admin password exists for anyone to know (Azure generates one
//   it never uses).
// - **Network**: reachable only from the core's subnet, through its free service endpoint. There is
//   no IP rule and no "allow Azure services".
// - **The core's database user** (read, write and migrate) is created afterwards in T-SQL by a
//   member of the break-glass group; the runbook says how (T031).

@description('The Azure region.')
param location string

@description('The server name: lowercase letters, digits and hyphens, globally unique.')
param serverName string

@description('The database name.')
param databaseName string

@description('The subnet SQL admits: the core\'s.')
param appSubnetId string

@description('The display name of the SQL break-glass group, the server\'s Entra admin.')
param adminGroupName string

@description('The object id of the SQL break-glass group.')
param adminGroupObjectId string

resource server 'Microsoft.Sql/servers@2023-08-01' = {
  name: serverName
  location: location
  properties: {
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    administrators: {
      administratorType: 'ActiveDirectory'
      principalType: 'Group'
      login: adminGroupName
      sid: adminGroupObjectId
      tenantId: subscription().tenantId
      azureADOnlyAuthentication: true
    }
  }
}

resource appSubnet 'Microsoft.Sql/servers/virtualNetworkRules@2023-08-01' = {
  parent: server
  name: 'core-subnet'
  properties: {
    virtualNetworkSubnetId: appSubnetId
    ignoreMissingVnetServiceEndpoint: false
  }
}

resource database 'Microsoft.Sql/servers/databases@2023-08-01' = {
  parent: server
  name: databaseName
  location: location
  sku: {
    name: 'Basic'
    tier: 'Basic'
    capacity: 5
  }
  properties: {
    maxSizeBytes: 2147483648
    zoneRedundant: false
  }
}

@description('The server\'s host name, `<server>.database.windows.net`.')
output serverHostName string = server.properties.fullyQualifiedDomainName

@description('The database\'s name.')
output databaseName string = database.name
