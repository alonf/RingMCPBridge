# Runs infra/home/new-connector-vm.ps1 against stand-ins for Hyper-V, the Storage cmdlets and
# curl.exe (DRIFT-001-73). Nothing here creates a VM, mounts a disk or downloads. The test hands in,
# through the environment:
# - HOMEVM_ARGS: the script's parameters, as a JSON object;
# - HOMEVM_WORLD: the host, as a JSON object:
#   - vmPath: the Hyper-V host's default VM folder (a temporary folder);
#   - switches: the switches that exist;
#   - vmExists: whether a VM with the name exists;
#   - hyperVRefuses: Get-VMHost fails, as it does when not elevated;
#   - image: the file the download of the image writes (a qcow2 fixture);
#   - sums: the SHA256SUMS text the download of the sums writes;
#   - address: the address the VM reports, or null;
#   - failOn: the name of a stand-in that fails, or null.
# Each call is printed as `CALL <command> <arguments>`, then the script's exit code as `EXIT <code>`.
param([Parameter(Mandatory)] [string] $ScriptPath)

$ErrorActionPreference = 'Stop'
$HomeVmWorld = $env:HOMEVM_WORLD | ConvertFrom-Json

function global:Write-Call([string] $Command, [object[]] $Arguments) {
    $parts = foreach ($argument in $Arguments) {
        if ($argument -is [string]) { $argument }
        elseif ($null -eq $argument) { '<null>' }
        elseif ($argument -is [bool] -or $argument -is [int] -or $argument -is [long]) { [string] $argument }
        else { "<$($argument.GetType().Name)>" }
    }
    Write-Host "CALL $Command $($parts -join ' ')"
    if ($HomeVmWorld.failOn -eq $Command) {
        throw "$Command failed (stand-in)."
    }
}

# Named arguments as the stand-ins receive them: '-Name', 'value', ... (curl.exe's: '--output').
function global:Get-Argument([object[]] $Arguments, [string] $Name) {
    for ($i = 0; $i -lt $Arguments.Count - 1; $i++) {
        if (@("-$Name", "-${Name}:", "--$Name") -contains $Arguments[$i]) { return $Arguments[$i + 1] }
    }
    return $null
}

function global:curl.exe {
    Write-Call 'curl.exe' $args
    $output = Get-Argument $args 'output'
    $url = [string] $args[-1]
    if ($url.EndsWith('SHA256SUMS')) {
        [IO.File]::WriteAllText($output, [string] $HomeVmWorld.sums)
    }
    else {
        Copy-Item -LiteralPath $HomeVmWorld.image -Destination $output
    }
    $global:LASTEXITCODE = 0
}

function global:Get-VMHost {
    Write-Call 'Get-VMHost' $args
    if ($HomeVmWorld.hyperVRefuses) { throw 'You do not have the required permission to complete this task.' }
    return [pscustomobject] @{ VirtualMachinePath = $HomeVmWorld.vmPath }
}

function global:Get-VMSwitch {
    Write-Call 'Get-VMSwitch' $args
    $name = Get-Argument $args 'Name'
    if (@($HomeVmWorld.switches) -contains $name) { return [pscustomobject] @{ Name = $name } }
    return $null
}

function global:Get-VM {
    Write-Call 'Get-VM' $args
    if ($HomeVmWorld.vmExists) { return [pscustomobject] @{ Name = (Get-Argument $args 'Name') } }
    return $null
}

# The disks' stand-ins write a file where the real cmdlet would, so the clean-up can be checked.
function global:Convert-VHD { Write-Call 'Convert-VHD' $args; [IO.File]::WriteAllText((Get-Argument $args 'DestinationPath'), 'vhdx') }
function global:Resize-VHD { Write-Call 'Resize-VHD' $args }
function global:New-VHD { Write-Call 'New-VHD' $args; [IO.File]::WriteAllText((Get-Argument $args 'Path'), 'seed'); return [pscustomobject] @{} }
function global:Mount-VHD { Write-Call 'Mount-VHD' $args; return [pscustomobject] @{ DiskNumber = 7 } }
function global:Dismount-VHD { Write-Call 'Dismount-VHD' $args }
function global:Initialize-Disk { Write-Call 'Initialize-Disk' $args }
function global:New-Partition { Write-Call 'New-Partition' $args; return [pscustomobject] @{ DiskNumber = 7; PartitionNumber = 1 } }
function global:Format-Volume { Write-Call 'Format-Volume' $args; return [pscustomobject] @{} }
function global:Add-PartitionAccessPath { Write-Call 'Add-PartitionAccessPath' $args }
function global:Remove-PartitionAccessPath { Write-Call 'Remove-PartitionAccessPath' $args }
function global:New-VM { Write-Call 'New-VM' $args; return [pscustomobject] @{ Name = (Get-Argument $args 'Name') } }
function global:Remove-VM { Write-Call 'Remove-VM' $args }
function global:Set-VMMemory { Write-Call 'Set-VMMemory' $args }
function global:Set-VMProcessor { Write-Call 'Set-VMProcessor' $args }
function global:Get-VMHardDiskDrive { Write-Call 'Get-VMHardDiskDrive' $args; return [pscustomobject] @{ Path = 'system' } }
function global:Set-VMFirmware { Write-Call 'Set-VMFirmware' $args }
function global:Add-VMHardDiskDrive { Write-Call 'Add-VMHardDiskDrive' $args }
function global:Set-VM { Write-Call 'Set-VM' $args }
function global:Set-VMNetworkAdapterVlan { Write-Call 'Set-VMNetworkAdapterVlan' $args }
function global:Start-VM { Write-Call 'Start-VM' $args }
function global:Get-VMNetworkAdapter {
    Write-Call 'Get-VMNetworkAdapter' $args
    $addresses = @()
    if ($HomeVmWorld.address) { $addresses = @('fe80::1', [string] $HomeVmWorld.address) }
    return [pscustomobject] @{ IPAddresses = $addresses }
}
function global:Start-Sleep { }

$arguments = $env:HOMEVM_ARGS | ConvertFrom-Json -AsHashtable
$global:LASTEXITCODE = 0
try {
    & $ScriptPath @arguments
    Write-Host "EXIT $global:LASTEXITCODE"
}
catch {
    Write-Host "FAILED $($_.Exception.Message)"
    Write-Host 'EXIT 1'
}
