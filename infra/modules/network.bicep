// The core's network (T030; R11, R12, DO6): one virtual network with one subnet that App Service
// integrates with. The subnet carries a free service endpoint for Azure SQL, so SQL can admit this
// subnet alone, with no private endpoint and no IP rule. Only private traffic and service-endpoint
// traffic go through the subnet; the core's calls to Entra, Key Vault and agents' metadata
// documents leave App Service directly, so no NAT gateway is needed.

@description('The Azure region.')
param location string

@description('The prefix of every resource name.')
param namePrefix string

var addressSpace = '10.42.0.0/24'
// A /26 leaves room for platform upgrades and a brief doubling during a scale operation.
var appSubnetPrefix = '10.42.0.0/26'

resource vnet 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: '${namePrefix}-vnet'
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [addressSpace]
    }
    subnets: [
      {
        name: 'app'
        properties: {
          addressPrefix: appSubnetPrefix
          delegations: [
            {
              name: 'app-service'
              properties: {
                serviceName: 'Microsoft.Web/serverFarms'
              }
            }
          ]
          serviceEndpoints: [
            {
              service: 'Microsoft.Sql'
              locations: [location]
            }
          ]
        }
      }
    ]
  }
}

@description('The subnet App Service integrates with, and SQL admits.')
output appSubnetId string = vnet.properties.subnets[0].id
