#Requires -Version 7.2
<#
.SYNOPSIS
The owner's bootstrap for the core's Azure deployment (T031; PT-05, PT-06, R13, DO6), run from the
owner's own PC, in two stages around the first deploy.

.DESCRIPTION
It only prints its plan unless -Apply is passed: without -Apply it calls neither az nor gh. With
-Apply, every step checks first and skips what is already done, so it is safe to run again. It never
prints, stores or asks for a secret: the sign-in is the owner's own (az login), and the first signing
key is generated in memory and written straight to Key Vault. Nothing in this file names the owner,
their tenant or their subscription; the values are typed when it runs.

-Stage before-deploy (the default), before the first deploy:
  1. Sign in (az login, in the browser), unless already signed in.
  2. Pick the subscription named -SubscriptionName (no default), and wait for the owner's "y".
  3. Create the resource group, in Israel Central by default.
  4. Create the deploy identity: a user-assigned managed identity with a federated credential for
     GitHub OIDC (the repository's -Environment), so no password or client secret exists.
  5. Give it its roles: Contributor on the resource group; role assignment on the resource group
     limited to the roles the Bicep assigns, to service principals only; AcrPush on the registry.
  6. Set the GitHub environment's variables with gh: the subscription, tenant and client IDs, the
     resource group and registry, and the Entra and SQL values from the runbook when given.

-Stage after-deploy, after the first deploy, which creates the core's identity:
  7. Grant the core's identity AcrPull on the registry, so App Service can pull the image.
  8. Make the core's identity the federated credential of the bridge's Entra app, and add the app's
     redirect URI, the core's sign-in return URL.
  9. Give the signed-in owner Key Vault Secrets Officer on the vault. Key Vault takes several
     minutes to honour a new role, so the key is written last.
 10. Print the T-SQL for the core's database user, which the owner runs as a member of the SQL
     break-glass group (infra/bootstrap/entra-app-registration.md), then restart the core.
 11. Write the first signing key (node bridge/src/host/main.ts first-signing-key), unless one is
     there. The core's Issuer picks it up within a minute.

.EXAMPLE
pwsh infra/bootstrap/bootstrap.ps1 -SubscriptionName '<subscription>' -GitHubRepo '<owner>/<repo>' -RegistryName '<registry>'
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string] $SubscriptionName,

    [Parameter(Mandatory)]
    [ValidatePattern('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')]
    [string] $GitHubRepo,

    [Parameter(Mandatory)]
    [ValidatePattern('^[A-Za-z0-9]{5,50}$')]
    [string] $RegistryName,

    [ValidateSet('before-deploy', 'after-deploy')]
    [string] $Stage = 'before-deploy',

    [ValidatePattern('^[A-Za-z0-9_().-]{1,90}$')]
    [string] $ResourceGroup = 'rg-ring-mcp-bridge',

    [ValidatePattern('^[a-z0-9]+$')]
    [string] $Location = 'israelcentral',

    [ValidatePattern('^[A-Za-z0-9_-]{1,64}$')]
    [string] $Environment = 'production',

    [ValidatePattern('^[A-Za-z0-9_-]{3,128}$')]
    [string] $DeployIdentityName = 'id-ring-mcp-bridge-deploy',

    # The deploy workflow's deployment name (T032), whose outputs the after-deploy stage reads.
    [ValidatePattern('^[A-Za-z0-9_.-]{1,64}$')]
    [string] $DeploymentName = 'ring-mcp-bridge-core',

    # From the runbook (entra-app-registration.md); each is set as a GitHub variable when given.
    [string] $EntraAppClientId,
    [string] $OwnerObjectId,
    [string] $SqlAdminGroupName,
    [string] $SqlAdminGroupObjectId,

    [switch] $Apply
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$TokenExchangeAudience = 'api://AzureADTokenExchange'
$GitHubIssuer = 'https://token.actions.githubusercontent.com'
# The roles the Bicep assigns, and the one rotation will need (DO6, A1): the deploy identity may
# assign these, and only these, and only to service principals.
$DelegatedRoles = @('Key Vault Secrets User', 'Key Vault Secrets Officer', 'Storage Blob Data Contributor')
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

function Write-Step([string] $Number, [string] $Text) {
    Write-Host ''
    Write-Host "[$Number] $Text"
}

function Write-Detail([string] $Text) {
    Write-Host "    $Text"
}

# az with JSON output: the parsed answer, $null for an empty one; a failure stops the script.
function Invoke-AzJson {
    param([Parameter(ValueFromRemainingArguments)] [string[]] $Arguments)
    $text = (& az @Arguments --only-show-errors --output json) -join "`n"
    if ($LASTEXITCODE -ne 0) {
        throw "az $($Arguments[0]) $($Arguments[1]) failed (exit code $LASTEXITCODE)."
    }
    if ([string]::IsNullOrWhiteSpace($text)) {
        return $null
    }
    return $text | ConvertFrom-Json
}

function Invoke-AzQuiet {
    param([Parameter(ValueFromRemainingArguments)] [string[]] $Arguments)
    & az @Arguments --only-show-errors --output none | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "az $($Arguments[0]) $($Arguments[1]) failed (exit code $LASTEXITCODE)."
    }
}

function Get-RoleId([string] $Name) {
    $id = Invoke-AzJson role definition list --name $Name --query '[0].name'
    if (-not $id) {
        throw "No built-in role named '$Name' was found."
    }
    return [string] $id
}

# Grants a role unless the principal already holds it at that scope.
function Grant-Role {
    param(
        [string] $PrincipalId,
        [ValidateSet('ServicePrincipal', 'User')] [string] $PrincipalType,
        [string] $RoleName,
        [string] $Scope,
        [string] $Condition
    )
    $roleId = Get-RoleId $RoleName
    $held = Invoke-AzJson role assignment list --assignee $PrincipalId --role $roleId --scope $Scope --query '[0].id'
    if ($held) {
        Write-Detail "$RoleName is already held."
        return
    }
    $arguments = @('role', 'assignment', 'create', '--assignee-object-id', $PrincipalId,
        '--assignee-principal-type', $PrincipalType, '--role', $roleId, '--scope', $Scope)
    if ($Condition) {
        $arguments += @('--condition', $Condition, '--condition-version', '2.0')
    }
    Invoke-AzQuiet @arguments
    Write-Detail "$RoleName granted."
}

# The condition that limits role assignment to the delegated roles and to service principals
# (Azure ABAC, "Constrain roles and principal types").
function Get-DelegationCondition {
    $ids = ($DelegatedRoles | ForEach-Object { Get-RoleId $_ }) -join ', '
    $write = "@Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {$ids} AND @Request[Microsoft.Authorization/roleAssignments:PrincipalType] ForAnyOfAnyValues:StringEqualsIgnoreCase {'ServicePrincipal'}"
    $delete = "@Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {$ids} AND @Resource[Microsoft.Authorization/roleAssignments:PrincipalType] ForAnyOfAnyValues:StringEqualsIgnoreCase {'ServicePrincipal'}"
    return "((!(ActionMatches{'Microsoft.Authorization/roleAssignments/write'})) OR ($write)) AND ((!(ActionMatches{'Microsoft.Authorization/roleAssignments/delete'})) OR ($delete))"
}

function Confirm-Owner([string] $Question) {
    $answer = Read-Host "$Question Type y to go on"
    if ($answer -ne 'y') {
        Write-Host 'Stopped; nothing more was changed.'
        exit 1
    }
}

# Steps 1 and 2, in both stages: signed in, on the named subscription.
function Select-Subscription {
    Write-Step 1 'Sign in'
    & az account show --only-show-errors --output none 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Detail 'Opening the browser for az login.'
        Invoke-AzQuiet login
    }
    else {
        Write-Detail 'Already signed in.'
    }

    Write-Step 2 'Subscription'
    $found = @(Invoke-AzJson account list --query "[?name=='$SubscriptionName']")
    if ($found.Count -ne 1) {
        throw "Expected one subscription named '$SubscriptionName'; found $($found.Count)."
    }
    $subscription = $found[0]
    Write-Detail "Subscription: $($subscription.name)"
    Confirm-Owner 'Is this the subscription to deploy the bridge into?'
    Invoke-AzQuiet account set --subscription $subscription.id
    return $subscription
}

function Show-Plan {
    Write-Host "Print only: nothing is changed and Azure is not called. Pass -Apply to run the $Stage stage."
    if ($Stage -eq 'before-deploy') {
        Write-Step 1 'Sign in with az login, in the browser, unless already signed in.'
        Write-Step 2 "Pick the subscription named '$SubscriptionName', and wait for your y."
        Write-Step 3 "Create the resource group '$ResourceGroup' in $Location, unless it exists."
        Write-Step 4 "Create the deploy identity '$DeployIdentityName', with a federated credential for GitHub OIDC: repo:${GitHubRepo}:environment:$Environment."
        Write-Step 5 'Give it its roles, unless held:'
        Write-Detail "Contributor on '$ResourceGroup';"
        Write-Detail "Role Based Access Control Administrator on '$ResourceGroup', limited to $($DelegatedRoles -join ', '), for service principals only;"
        Write-Detail "AcrPush on the registry '$RegistryName'."
        Write-Step 6 "Set the variables of the GitHub environment '$Environment' in $GitHubRepo with gh."
    }
    else {
        Write-Step 7 "Grant the core's identity AcrPull on the registry '$RegistryName'."
        Write-Step 8 "Make the core's identity the Entra app's federated credential, and add the app's redirect URI."
        Write-Step 9 'Give you Key Vault Secrets Officer on the vault.'
        Write-Step 10 "Print the T-SQL for the core's database user, then restart the core once you say it is done."
        Write-Step 11 'Write the first signing key, unless one is there.'
    }
}

function Invoke-BeforeDeploy {
    $subscription = Select-Subscription

    Write-Step 3 'Resource group'
    if (Invoke-AzJson group exists --name $ResourceGroup) {
        Write-Detail "'$ResourceGroup' exists."
    }
    else {
        Invoke-AzQuiet group create --name $ResourceGroup --location $Location
        Write-Detail "'$ResourceGroup' created in $Location."
    }
    $groupScope = "/subscriptions/$($subscription.id)/resourceGroups/$ResourceGroup"

    Write-Step 4 'Deploy identity'
    $identity = @(Invoke-AzJson identity list --resource-group $ResourceGroup --query "[?name=='$DeployIdentityName']")[0]
    if ($identity) {
        Write-Detail "'$DeployIdentityName' exists."
    }
    else {
        $identity = Invoke-AzJson identity create --resource-group $ResourceGroup --name $DeployIdentityName --location $Location
        Write-Detail "'$DeployIdentityName' created."
    }
    $credentialName = "github-$Environment"
    $credential = @(Invoke-AzJson identity federated-credential list --identity-name $DeployIdentityName --resource-group $ResourceGroup --query "[?name=='$credentialName']")[0]
    if ($credential) {
        Write-Detail "Its GitHub credential exists."
    }
    else {
        Invoke-AzQuiet identity federated-credential create --name $credentialName --identity-name $DeployIdentityName --resource-group $ResourceGroup --issuer $GitHubIssuer --subject "repo:${GitHubRepo}:environment:$Environment" --audiences $TokenExchangeAudience
        Write-Detail "Its GitHub credential created: repo:${GitHubRepo}:environment:$Environment."
    }

    Write-Step 5 'Its roles'
    Grant-Role -PrincipalId $identity.principalId -PrincipalType ServicePrincipal -RoleName 'Contributor' -Scope $groupScope
    Grant-Role -PrincipalId $identity.principalId -PrincipalType ServicePrincipal -RoleName 'Role Based Access Control Administrator' -Scope $groupScope -Condition (Get-DelegationCondition)
    $registryId = Invoke-AzJson acr show --name $RegistryName --query id
    Grant-Role -PrincipalId $identity.principalId -PrincipalType ServicePrincipal -RoleName 'AcrPush' -Scope $registryId
    $armTokens = Invoke-AzJson acr config authentication-as-arm show --registry $RegistryName --query status
    if ($armTokens -ne 'enabled') {
        Write-Warning "The registry does not accept ARM-audience tokens, so App Service cannot pull with a managed identity. To allow them: az acr config authentication-as-arm update --registry $RegistryName --status enabled"
    }

    Write-Step 6 'GitHub variables'
    & gh repo view $GitHubRepo --json name 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Detail "The GitHub repository $GitHubRepo was not found; skipped. Run this stage again once it exists."
        return
    }
    # Read first: a PUT on an existing environment could reset its protection rules.
    & gh api "repos/$GitHubRepo/environments/$Environment" --silent 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Detail "The environment '$Environment' exists."
    }
    else {
        & gh api --method PUT "repos/$GitHubRepo/environments/$Environment" --silent | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "The GitHub environment '$Environment' could not be created. In a private repository, environments and their variables need GitHub Pro or Team."
        }
        Write-Detail "The environment '$Environment' created."
    }
    $variables = [ordered]@{
        AZURE_CLIENT_ID       = $identity.clientId
        AZURE_TENANT_ID       = $subscription.tenantId
        AZURE_SUBSCRIPTION_ID = $subscription.id
        AZURE_RESOURCE_GROUP  = $ResourceGroup
        AZURE_REGISTRY_NAME   = $RegistryName
    }
    $fromRunbook = [ordered]@{
        BRIDGE_ENTRA_CLIENT_ID    = $EntraAppClientId
        BRIDGE_OWNER_OBJECT_ID    = $OwnerObjectId
        SQL_ADMIN_GROUP_NAME      = $SqlAdminGroupName
        SQL_ADMIN_GROUP_OBJECT_ID = $SqlAdminGroupObjectId
    }
    foreach ($name in $fromRunbook.Keys) {
        if ($fromRunbook[$name]) {
            $variables[$name] = $fromRunbook[$name]
        }
        else {
            Write-Detail "$name not given: pass it from the runbook, or set it in the environment yourself."
        }
    }
    $present = @{}
    $listed = (& gh variable list --env $Environment --repo $GitHubRepo --json name,value) -join "`n"
    if ($LASTEXITCODE -ne 0) {
        throw "The variables of the GitHub environment '$Environment' could not be read."
    }
    if (-not [string]::IsNullOrWhiteSpace($listed)) {
        foreach ($variable in @($listed | ConvertFrom-Json)) {
            $present[$variable.name] = $variable.value
        }
    }
    foreach ($name in $variables.Keys) {
        if ($present.ContainsKey($name) -and $present[$name] -eq $variables[$name]) {
            Write-Detail "$name is already set."
            continue
        }
        & gh variable set $name --env $Environment --repo $GitHubRepo --body $variables[$name] | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "The GitHub variable $name could not be set. In a private repository, environment variables need GitHub Pro or Team."
        }
        Write-Detail "$name set."
    }
}

function Invoke-AfterDeploy {
    $subscription = Select-Subscription
    if (-not $EntraAppClientId) {
        throw 'The after-deploy stage needs -EntraAppClientId, the bridge''s Entra app registration (from the runbook).'
    }
    $outputs = Invoke-AzJson deployment group show --resource-group $ResourceGroup --name $DeploymentName --query properties.outputs
    if (-not $outputs) {
        throw "No deployment '$DeploymentName' in '$ResourceGroup': run the first deploy (T032) before this stage."
    }
    $corePrincipalId = $outputs.coreIdentityPrincipalId.value
    $coreIdentityName = $outputs.coreIdentityName.value
    $publicUrl = $outputs.publicUrl.value

    Write-Step 7 "The core's image"
    $registryId = Invoke-AzJson acr show --name $RegistryName --query id
    Grant-Role -PrincipalId $corePrincipalId -PrincipalType ServicePrincipal -RoleName 'AcrPull' -Scope $registryId

    Write-Step 8 'The Entra app'
    $credentialName = 'core-identity'
    $credential = @(Invoke-AzJson ad app federated-credential list --id $EntraAppClientId --query "[?name=='$credentialName']")[0]
    if ($credential) {
        Write-Detail 'The core identity is already its federated credential.'
    }
    else {
        $parameters = @{
            name        = $credentialName
            issuer      = "https://login.microsoftonline.com/$($subscription.tenantId)/v2.0"
            subject     = $corePrincipalId
            description = 'The bridge core''s user-assigned managed identity'
            audiences   = @($TokenExchangeAudience)
        } | ConvertTo-Json -Compress
        # Through a file: quotes inside an argument do not survive az.cmd on Windows. It holds no secret.
        $file = New-TemporaryFile
        try {
            Set-Content -LiteralPath $file.FullName -Value $parameters -NoNewline
            Invoke-AzQuiet ad app federated-credential create --id $EntraAppClientId --parameters "@$($file.FullName)"
        }
        finally {
            Remove-Item -LiteralPath $file.FullName -Force
        }
        Write-Detail 'The core identity is now its federated credential.'
    }
    $redirectUri = "$publicUrl/sign-in/return"
    $redirects = @(Invoke-AzJson ad app show --id $EntraAppClientId --query web.redirectUris)
    if ($redirects -contains $redirectUri) {
        Write-Detail "Its redirect URI is already $redirectUri."
    }
    else {
        $all = @($redirects | Where-Object { $_ }) + $redirectUri
        Invoke-AzQuiet ad app update --id $EntraAppClientId --web-redirect-uris @all
        Write-Detail "Its redirect URI $redirectUri added."
    }

    Write-Step 9 'Your role on the vault'
    $vault = Invoke-AzJson keyvault show --name $outputs.keyVaultName.value --query '{id:id, uri:properties.vaultUri}'
    $owner = Invoke-AzJson ad signed-in-user show --query id
    Grant-Role -PrincipalId $owner -PrincipalType User -RoleName 'Key Vault Secrets Officer' -Scope $vault.id

    Write-Step 10 "The core's database user"
    Write-Detail "As a member of the SQL break-glass group, with your PC's address allowed for the moment, run this in the database '$($outputs.sqlServerHostName.value)' / bridge (the portal's query editor will do):"
    Write-Host ''
    Write-Host "    CREATE USER [$coreIdentityName] FROM EXTERNAL PROVIDER;"
    Write-Host "    ALTER ROLE db_datareader ADD MEMBER [$coreIdentityName];"
    Write-Host "    ALTER ROLE db_datawriter ADD MEMBER [$coreIdentityName];"
    Write-Host "    ALTER ROLE db_ddladmin ADD MEMBER [$coreIdentityName];"
    Write-Host ''
    Write-Detail 'Then remove your PC''s address and leave the break-glass group (entra-app-registration.md).'
    Confirm-Owner 'Is the database user created?'
    Invoke-AzQuiet webapp restart --resource-group $ResourceGroup --name $outputs.appName.value
    Write-Detail 'The core restarted.'

    Write-Step 11 'The first signing key'
    & node (Join-Path $RepoRoot 'bridge/src/host/main.ts') first-signing-key $vault.uri.TrimEnd('/')
    if ($LASTEXITCODE -ne 0) {
        throw 'The first signing key was not written; see the message above. Rerunning this stage repeats only what is missing.'
    }
    Write-Detail "Its smoke test, within a minute: $publicUrl/readyz"
}

if (-not $Apply) {
    Show-Plan
    exit 0
}
if ($Stage -eq 'before-deploy') {
    Invoke-BeforeDeploy
}
else {
    Invoke-AfterDeploy
}
Write-Host ''
Write-Host "The $Stage stage is done."
