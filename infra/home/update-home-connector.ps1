#Requires -Version 7.0
<#
.SYNOPSIS
Match the home connector to the image configured on the production Azure App Service.
.DESCRIPTION
Run on the Hyper-V host with Azure CLI, OpenSSH and an existing trusted SSH key for
the VM. On another PC supply -SshHost. Use -CheckOnly for a read-only comparison.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9-]{0,59}$')]
    [string] $AppName,
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9.-]*$')]
    [string] $VMName = 'ring-bridge',
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9.-]*$')]
    [string] $SshHost,
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9.-]*$')]
    [string] $FallbackHost,
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9.-]*$')]
    [string] $HostKeyAlias,
    [ValidatePattern('^[a-z_][a-z0-9_-]*$')]
    [string] $SshUser = 'bridge',
    [switch] $CheckOnly
)

$ErrorActionPreference = 'Stop'
$null = Get-Command az, ssh -CommandType Application
$query = "[?name=='$AppName'].siteConfig.linuxFxVersion"
$image = az webapp list --query $query --output tsv --only-show-errors
if ($LASTEXITCODE -ne 0) { throw 'Cannot read App Service. Check az login and the active Azure subscription.' }
if (@($image).Count -ne 1 -or $image -cnotmatch '^DOCKER\|[a-z0-9.-]+/ring-mcp-bridge:([0-9a-f]{40})$') {
    throw "Expected one App Service named '$AppName' running ring-mcp-bridge with a full commit tag. Check the Azure subscription."
}
$tag = $Matches[1]

if (-not $SshHost) {
    $addresses = @()
    try {
        $adapters = Get-VMNetworkAdapter -VMName $VMName -ErrorAction Stop
        $addresses = @($adapters.IPAddresses | Where-Object { $_ -match '^(?!127\.|169\.254\.)\d+(\.\d+){3}$' } | Sort-Object -Unique)
    }
    catch {
        Write-Verbose "Hyper-V address lookup failed: $_"
    }
    if ($addresses.Count -gt 1) { throw "VM '$VMName' has more than one IPv4 address. Select one with -SshHost." }
    $SshHost = if ($addresses.Count) { $addresses[0] } else { $FallbackHost }
    if (-not $SshHost) { throw "Cannot discover the IPv4 address for '$VMName'. Run with Hyper-V access or supply -SshHost." }
}
$sshArgs = @('-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10')
if ($HostKeyAlias) { $sshArgs += @('-o', "HostKeyAlias=$HostKeyAlias") }
$sshArgs += "$SshUser@$SshHost"

Write-Output "Azure target $tag. Checking $SshUser@$SshHost."
# Read the container's own configured image and Docker health. A stopped container
# must be started even if its tag already matches.
$inspect = 'docker inspect --format "{{.Config.Image}} {{.State.Status}} {{.State.Health.Status}}" ring-bridge-connector'
$state = ssh @sshArgs $inspect
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect the installed connector. Verify the VM address, trusted SSH key and Docker access.' }
$expected = '^[^\s]+/ring-mcp-bridge:' + $tag + ' running healthy$'
if ($state -cmatch $expected) { Write-Output 'Home connector is current and healthy.'; return }
Write-Output "Current home container: $state"
if ($CheckOnly) { Write-Output 'An update or restart is needed.'; return }

ssh @sshArgs "ring-bridge-update $tag >/dev/null"
if ($LASTEXITCODE -ne 0) { throw 'ring-bridge-update failed on the VM. Inspect its container before retrying.' }
for ($attempt = 0; $attempt -lt 24; $attempt++) {
    $state = ssh @sshArgs $inspect
    if ($LASTEXITCODE -ne 0) { throw 'Lost access while verifying the updated container.' }
    if ($state -cmatch $expected) { Write-Output "Home connector updated to $tag and healthy."; return }
    Start-Sleep -Seconds 5
}
throw "Update ran, but the expected image did not become healthy. Last container state: $state"
