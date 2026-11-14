#Requires -Version 5.1
<#
.SYNOPSIS
Creates the home connector's VM on a Hyper-V host, such as Windows Server 2025, and prepares it to
run the connector's container (research.md R10; DRIFT-001-73).

.DESCRIPTION
It only prints its plan unless -Apply is passed: without -Apply it changes nothing, downloads
nothing and calls no Hyper-V command. Run it elevated (as an administrator) on the Hyper-V host,
in Windows PowerShell 5.1 or PowerShell 7. It needs this folder's convert-qcow2.ps1 beside it.

With -Apply:
  1. Check that Hyper-V answers, that the switch exists and that no VM has the name.
  2. Download Ubuntu 24.04 LTS's cloud image over HTTPS, and check it against Canonical's
     SHA256SUMS. A copy from an earlier run, with the right hash, is used again.
  3. Convert it to a dynamic VHDX (convert-qcow2.ps1, then Convert-VHD) and grow it to -DiskGB.
     The root partition grows to fill it at first boot.
  4. Write the first-boot settings (cloud-init's NoCloud seed) to a small FAT32 disk labelled
     CIDATA, and keep a copy in the VM's folder:
     - the admin user, who signs in with your SSH key only;
     - Docker and Hyper-V's guest tools from Ubuntu's archive, all packages updated, and Ubuntu's
       automatic security updates (on by default);
     - the connector's folders, owned by the user the container runs as (uid 1000);
     - two commands, ring-bridge-setup and ring-bridge-start, and a pull of -Image.
  5. Create the VM: generation 2, Secure Boot with the Microsoft UEFI CA template, -ProcessorCount
     vCPU, -MemoryGB of static memory, checkpoints off (its disk will hold the Ring token), started
     with the host and shut down with it.
  6. Start it, and wait for the address it reports through Hyper-V's guest tools.

If a step fails, what this run created is removed again; the downloaded image is kept.

It never runs the setup, which is your Ring login and 2FA, typed by you at the VM's terminal. It
never starts the connector, which needs the setup first. Keeping the VM out of the host's backups
depends on your backup tool, so it is left to you.

.EXAMPLE
.\new-connector-vm.ps1 -SwitchName 'External' -SshPublicKeyPath "$HOME\.ssh\id_ed25519.pub" `
  -Image 'ghcr.io/<owner>/ring-mcp-bridge:<tag>' -CoreUrl 'wss://<core-host>/link'
#>
[CmdletBinding()]
param(
    # An existing Hyper-V virtual switch with internet access: Get-VMSwitch lists them.
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string] $SwitchName,

    # The connector's image, with the tag the core runs, so the admin page does not show it behind.
    [Parameter(Mandatory)]
    [ValidatePattern('^[a-z0-9.-]+(:[0-9]+)?(/[a-z0-9._-]+)+:[A-Za-z0-9._-]{1,128}$')]
    [string] $Image,

    # The core's link: wss://<core-host>/link.
    [Parameter(Mandatory)]
    [ValidatePattern('^wss://[A-Za-z0-9.-]+(:[0-9]+)?/link$')]
    [string] $CoreUrl,

    # Your SSH public key (ssh-keygen -t ed25519 makes one); its comment is left out.
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string] $SshPublicKeyPath,

    # The VM's name, also its host name.
    [ValidatePattern('^[A-Za-z][A-Za-z0-9-]{0,14}$')]
    [string] $VMName = 'ring-bridge',

    [ValidatePattern('^[a-z_][a-z0-9_-]{0,31}$')]
    [string] $AdminUser = 'bridge',

    # Where the VM's folder goes; empty uses the Hyper-V host's default.
    [string] $VMPath = '',

    [ValidateRange(1, 16)]
    [int] $ProcessorCount = 2,

    [ValidateRange(1, 64)]
    [int] $MemoryGB = 2,

    [ValidateRange(10, 512)]
    [int] $DiskGB = 20,

    # A VLAN for the VM's network adapter; 0 leaves it untagged.
    [ValidateRange(0, 4094)]
    [int] $VlanId = 0,

    # Ubuntu 24.04's cloud image; SHA256SUMS is read from the same folder.
    [ValidatePattern('^https://[^\s]+/[^/\s]+\.img$')]
    [string] $ImageUrl = 'https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img',

    [switch] $Apply
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Converter = Join-Path $PSScriptRoot 'convert-qcow2.ps1'
$SeedBytes = 64MB
$AddressWaitMinutes = 15
$AddressPollSeconds = 10

function Write-Step([string] $Number, [string] $Text) {
    Write-Host ''
    Write-Host "[$Number] $Text"
}

function Write-Detail([string] $Text) {
    Write-Host "    $Text"
}

# The key's type and body only: the comment could carry characters the first-boot file would read
# as its own syntax.
function Read-SshPublicKey {
    if (-not (Test-Path -LiteralPath $SshPublicKeyPath -PathType Leaf)) {
        throw "No SSH public key at '$SshPublicKeyPath'. Make one with: ssh-keygen -t ed25519"
    }
    $text = ([IO.File]::ReadAllText((Resolve-Path -LiteralPath $SshPublicKeyPath).ProviderPath)).Trim()
    $pattern = '^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp256|ecdsa-sha2-nistp384|ecdsa-sha2-nistp521|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com) ([A-Za-z0-9+/]+={0,3})(\s.*)?$'
    $match = [regex]::Match($text, $pattern)
    if (-not $match.Success -or $text.Contains("`n")) {
        throw "'$SshPublicKeyPath' does not hold one SSH public key (the .pub file, not the private key)."
    }
    return "$($match.Groups[1].Value) $($match.Groups[2].Value)"
}

# cloud-init's user-data: the first boot's settings. Every value in it was checked by a pattern.
function Get-UserData([string] $Key) {
    $lines = @(
        '#cloud-config'
        '# The Ring MCP Bridge home connector VM (infra/home/new-connector-vm.ps1), applied once, at first boot.'
        "hostname: $VMName"
        'users:'
        "  - name: $AdminUser"
        '    shell: /bin/bash'
        '    sudo: "ALL=(ALL) NOPASSWD:ALL"'
        '    lock_passwd: true'
        '    ssh_authorized_keys:'
        "      - '$Key'"
        'ssh_pwauth: false'
        'disable_root: true'
        'package_update: true'
        'package_upgrade: true'
        'packages:'
        '  - docker.io'
        '  - linux-cloud-tools-virtual'
        'write_files:'
        '  - path: /etc/ring-bridge/bridge.env'
        "    permissions: '0644'"
        '    content: |'
        "      IMAGE=$Image"
        "      BRIDGE_CORE_URL=$CoreUrl"
        '  - path: /usr/local/bin/ring-bridge-setup'
        "    permissions: '0755'"
        '    content: |'
        '      #!/bin/sh'
        '      # The Setup CLI: your Ring login and 2FA, typed here by you. Run it once, before ring-bridge-start.'
        '      set -eu'
        '      . /etc/ring-bridge/bridge.env'
        '      exec docker run -it --rm --name ring-bridge-setup \'
        '        -e BRIDGE_DATA_DIR=/data -e BRIDGE_SECRETS_KEY_FILE=/run/secrets/bridge-secrets-key \'
        '        -v /srv/ring-bridge/data:/data -v /srv/ring-bridge/secrets:/run/secrets \'
        '        "$IMAGE" setup'
        '  - path: /usr/local/bin/ring-bridge-start'
        "    permissions: '0755'"
        '    content: |'
        '      #!/bin/sh'
        '      # Starts the connector, or starts it again on the image in /etc/ring-bridge/bridge.env.'
        '      set -eu'
        '      . /etc/ring-bridge/bridge.env'
        '      if [ ! -s /srv/ring-bridge/secrets/bridge-secrets-key ]; then'
        '        echo "Run ring-bridge-setup first." >&2'
        '        exit 1'
        '      fi'
        '      docker rm -f ring-bridge-connector >/dev/null 2>&1 || true'
        '      docker run -d --name ring-bridge-connector --restart unless-stopped \'
        '        --log-opt max-size=10m --log-opt max-file=3 \'
        '        -e BRIDGE_MODE=connector -e BRIDGE_CORE_URL="$BRIDGE_CORE_URL" \'
        '        -e BRIDGE_DATA_DIR=/data -e BRIDGE_SECRETS_KEY_FILE=/run/secrets/bridge-secrets-key \'
        '        -v /srv/ring-bridge/data:/data -v /srv/ring-bridge/secrets:/run/secrets \'
        '        "$IMAGE"'
        '      echo "Started. Its enrollment code: docker logs ring-bridge-connector"'
        'runcmd:'
        '  # The guest tools for the running kernel, so Hyper-V sees the address before any reboot.'
        '  - [sh, -c, ''apt-get install -y "linux-cloud-tools-$(uname -r)"'']'
        '  # Their udev rules arrived after this boot made the Hyper-V devices, so systemd has no unit for'
        '  # those devices, and hv-kvp-daemon, bound to its device, would not start: replay the devices.'
        '  - [udevadm, control, --reload]'
        '  - [udevadm, trigger, --action=add, --subsystem-match=misc]'
        '  - [udevadm, settle]'
        '  - [systemctl, enable, --now, hv-kvp-daemon.service]'
        '  - [mkdir, -p, /srv/ring-bridge/data, /srv/ring-bridge/secrets]'
        "  - [chown, -R, '1000:1000', /srv/ring-bridge]"
        "  - [chmod, '700', /srv/ring-bridge/secrets]"
        "  - [usermod, -aG, docker, $AdminUser]"
        '  - [sh, -c, ''. /etc/ring-bridge/bridge.env && docker pull "$IMAGE"'']'
    )
    return ($lines -join "`n") + "`n"
}

function Get-MetaData {
    return "instance-id: $VMName-$([DateTime]::UtcNow.ToString('yyyyMMddHHmmss'))`nlocal-hostname: $VMName`n"
}

# Deletes a file or a folder. .NET, not Remove-Item: Remove-Item fails on a path with 8.3 short
# names, such as a temporary folder under C:\Users\ADMINI~1.
function Clear-Item([string] $Path) {
    if ([IO.File]::Exists($Path)) {
        [IO.File]::Delete($Path)
    }
    elseif ([IO.Directory]::Exists($Path)) {
        [IO.Directory]::Delete($Path, $true)
    }
}

# SHA-256 through .NET, as Get-FileHash can be missing where the module path is mixed up.
function Get-Sha256([string] $Path) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($Path)
    try {
        return ([BitConverter]::ToString($algorithm.ComputeHash($stream)) -replace '-', '').ToLowerInvariant()
    }
    finally {
        $stream.Dispose()
        $algorithm.Dispose()
    }
}

function Write-LfFile([string] $Path, [string] $Text) {
    [IO.File]::WriteAllText($Path, $Text, (New-Object Text.UTF8Encoding $false))
}

function Show-Plan {
    Write-Host "Print only: nothing is changed or downloaded. Run it again elevated, with -Apply."
    Write-Step 1 "Check that Hyper-V answers, that the switch '$SwitchName' exists, and that no VM is named '$VMName'. Get-VMSwitch lists the switches."
    Write-Step 2 "Download $ImageUrl and check it against SHA256SUMS."
    Write-Step 3 "Convert it to a dynamic VHDX of $DiskGB GB."
    Write-Step 4 "Write the first-boot settings: the user '$AdminUser' with the SSH key in '$SshPublicKeyPath', Docker, the guest tools, the connector's folders, ring-bridge-setup and ring-bridge-start, and a pull of $Image."
    Write-Step 5 "Create the VM '$VMName': generation 2, Secure Boot (Microsoft UEFI CA), $ProcessorCount vCPU, $MemoryGB GB static memory, checkpoints off, started with the host$(if ($VlanId) { ", VLAN $VlanId" })."
    Write-Step 6 'Start it, and wait for its address.'
    Write-Host ''
    Write-Host 'It never runs the setup, your Ring login, and never starts the connector.'
}

function Get-ExpectedHash([string] $SumsFile, [string] $Name) {
    foreach ($line in [IO.File]::ReadAllLines($SumsFile)) {
        $parts = $line.Trim() -split '\s+', 2
        if ($parts.Count -eq 2 -and $parts[1].TrimStart('*') -eq $Name) {
            return $parts[0].ToLowerInvariant()
        }
    }
    throw "SHA256SUMS has no line for $Name."
}

function Invoke-Download([string] $Url, [string] $File) {
    & curl.exe --fail --location --silent --show-error --output $File $Url
    if ($LASTEXITCODE -ne 0) {
        throw "The download of $Url failed (curl exit code $LASTEXITCODE)."
    }
}

# The cloud image, downloaded or kept from an earlier run, checked against Canonical's SHA256SUMS.
function Get-CloudImage([string] $Folder) {
    $name = $ImageUrl.Substring($ImageUrl.LastIndexOf('/') + 1)
    $sumsUrl = $ImageUrl.Substring(0, $ImageUrl.LastIndexOf('/') + 1) + 'SHA256SUMS'
    $sums = Join-Path $Folder 'SHA256SUMS'
    $file = Join-Path $Folder $name
    Invoke-Download $sumsUrl $sums
    $expected = Get-ExpectedHash $sums $name
    if ([IO.File]::Exists($file) -and (Get-Sha256 $file) -eq $expected) {
        Write-Detail "$name from an earlier run, checked."
        return $file
    }
    Write-Detail "Downloading $name (about 600 MB)."
    Invoke-Download $ImageUrl $file
    $actual = Get-Sha256 $file
    if ($actual -ne $expected) {
        Clear-Item $file
        throw "$name does not match SHA256SUMS (expected $expected, got $actual); it was deleted."
    }
    Write-Detail "$name downloaded and checked."
    return $file
}

# The seed disk: FAT32, labelled CIDATA, mounted on a folder so no drive letter is taken.
function Write-SeedDisk([string] $Path, [string] $Settings, [string] $MountFolder) {
    New-VHD -Path $Path -SizeBytes $SeedBytes -Dynamic | Out-Null
    $mounted = Mount-VHD -Path $Path -Passthru
    try {
        Initialize-Disk -Number $mounted.DiskNumber -PartitionStyle MBR
        $partition = New-Partition -DiskNumber $mounted.DiskNumber -UseMaximumSize
        Format-Volume -Partition $partition -FileSystem FAT32 -NewFileSystemLabel 'CIDATA' -Confirm:$false | Out-Null
        New-Item -ItemType Directory -Path $MountFolder -Force | Out-Null
        Add-PartitionAccessPath -DiskNumber $mounted.DiskNumber -PartitionNumber $partition.PartitionNumber -AccessPath $MountFolder
        try {
            foreach ($name in @('user-data', 'meta-data')) {
                Copy-Item -LiteralPath (Join-Path $Settings $name) -Destination (Join-Path $MountFolder $name)
            }
        }
        finally {
            Remove-PartitionAccessPath -DiskNumber $mounted.DiskNumber -PartitionNumber $partition.PartitionNumber -AccessPath $MountFolder
        }
    }
    finally {
        Dismount-VHD -Path $Path
    }
    Clear-Item $MountFolder
}

function Wait-Address {
    $polls = [int] ($AddressWaitMinutes * 60 / $AddressPollSeconds)
    for ($poll = 0; $poll -lt $polls; $poll++) {
        $adapter = Get-VMNetworkAdapter -VMName $VMName
        $addresses = @($adapter.IPAddresses | Where-Object { $_ -match '^\d{1,3}(\.\d{1,3}){3}$' })
        if ($addresses.Count -gt 0) {
            return $addresses[0]
        }
        Start-Sleep -Seconds $AddressPollSeconds
    }
    return $null
}

function Invoke-Apply {
    $key = Read-SshPublicKey
    if (-not (Test-Path -LiteralPath $Converter -PathType Leaf)) {
        throw "convert-qcow2.ps1 must be beside this script: $Converter"
    }

    Write-Step 1 'Checks'
    try {
        $vmHost = Get-VMHost
    }
    catch {
        throw "Hyper-V did not answer: run this elevated, as an administrator, on the Hyper-V host. ($($_.Exception.Message))"
    }
    if (-not (Get-VMSwitch -Name $SwitchName -ErrorAction SilentlyContinue)) {
        throw "No Hyper-V switch named '$SwitchName'. Get-VMSwitch lists them."
    }
    if (Get-VM -Name $VMName -ErrorAction SilentlyContinue) {
        throw "A VM named '$VMName' already exists. Choose another -VMName, or remove that VM first."
    }
    $parent = $VMPath
    if (-not $parent) {
        $parent = $vmHost.VirtualMachinePath
    }
    $vmFolder = Join-Path $parent $VMName
    $diskFolder = Join-Path $vmFolder 'Virtual Hard Disks'
    $osDisk = Join-Path $diskFolder "$VMName-os.vhdx"
    $seedDisk = Join-Path $diskFolder "$VMName-seed.vhdx"
    foreach ($disk in @($osDisk, $seedDisk)) {
        if (Test-Path -LiteralPath $disk) {
            throw "'$disk' already exists, though no VM is named '$VMName'. Move or delete it first."
        }
    }
    Write-Detail "Hyper-V answers; the switch '$SwitchName' exists; the VM goes in '$vmFolder'."

    $created = New-Object System.Collections.Generic.List[string]
    $vmCreated = $false
    $download = Join-Path $vmFolder 'download'
    try {
        foreach ($folder in @($vmFolder, $diskFolder, $download)) {
            if (-not (Test-Path -LiteralPath $folder)) {
                New-Item -ItemType Directory -Path $folder | Out-Null
                $created.Add($folder)
            }
        }

        Write-Step 2 'The cloud image'
        # Not $image: PowerShell's names ignore case, and it would hide the -Image parameter from the
        # first-boot settings written below.
        $cloudImage = Get-CloudImage $download

        Write-Step 3 'The system disk'
        $fixed = Join-Path $diskFolder "$VMName-os.vhd"
        $created.Add($fixed)
        & $Converter -Path $cloudImage -Destination $fixed
        $created.Add($osDisk)
        Convert-VHD -Path $fixed -DestinationPath $osDisk -VHDType Dynamic
        Clear-Item $fixed
        Resize-VHD -Path $osDisk -SizeBytes ([int64] $DiskGB * 1GB)
        Write-Detail "$osDisk, $DiskGB GB."

        Write-Step 4 'The first-boot settings'
        $settings = Join-Path $vmFolder 'first-boot'
        if (-not (Test-Path -LiteralPath $settings)) {
            New-Item -ItemType Directory -Path $settings | Out-Null
            $created.Add($settings)
        }
        Write-LfFile (Join-Path $settings 'user-data') (Get-UserData $key)
        Write-LfFile (Join-Path $settings 'meta-data') (Get-MetaData)
        $created.Add($seedDisk)
        # Mounted under the system's temporary folder, which is NTFS, so the mount works whatever the
        # VM folder's file system is.
        $mountFolder = Join-Path ([IO.Path]::GetTempPath()) "ring-bridge-seed-$([guid]::NewGuid().ToString('N'))"
        Write-SeedDisk -Path $seedDisk -Settings $settings -MountFolder $mountFolder
        Write-Detail "$seedDisk; a copy of the settings is in $settings."

        Write-Step 5 'The VM'
        New-VM -Name $VMName -Generation 2 -MemoryStartupBytes ([int64] $MemoryGB * 1GB) -VHDPath $osDisk -SwitchName $SwitchName -Path $parent | Out-Null
        $vmCreated = $true
        Set-VMMemory -VMName $VMName -DynamicMemoryEnabled $false
        Set-VMProcessor -VMName $VMName -Count $ProcessorCount
        $systemDrive = Get-VMHardDiskDrive -VMName $VMName
        Set-VMFirmware -VMName $VMName -EnableSecureBoot On -SecureBootTemplate MicrosoftUEFICertificateAuthority -FirstBootDevice $systemDrive
        Add-VMHardDiskDrive -VMName $VMName -Path $seedDisk
        Set-VM -Name $VMName -AutomaticStartAction Start -AutomaticStopAction ShutDown -CheckpointType Disabled
        if ($VlanId) {
            Set-VMNetworkAdapterVlan -VMName $VMName -Access -VlanId $VlanId
        }
        Write-Detail "'$VMName' created."

        Write-Step 6 'First boot'
        Start-VM -Name $VMName
    }
    catch {
        Write-Host ''
        Write-Host 'Stopped; removing what this run created (the downloaded image is kept).'
        if ($vmCreated) {
            Remove-VM -Name $VMName -Force
        }
        for ($i = $created.Count - 1; $i -ge 0; $i--) {
            if ($created[$i] -ne $download -and $created[$i] -ne $vmFolder) {
                Clear-Item $created[$i]
            }
        }
        throw
    }
    Clear-Item $download

    Write-Detail "Started. The first boot installs Docker and the guest tools, then pulls the image: about 5 to 10 minutes."
    $address = Wait-Address
    Write-Host ''
    if ($address) {
        Write-Host "The VM is at $address. Next, from a terminal on this host or your PC:"
        Write-Host "  ssh $AdminUser@$address"
    }
    else {
        # Sign-in is by SSH key only, so the console cannot sign in; the router's list of DHCP leases
        # shows the address by the adapter's MAC address, which Hyper-V knows without the guest tools.
        $mac = [string] (Get-VMNetworkAdapter -VMName $VMName).MacAddress
        $mac = ($mac -replace '(..)(?!$)', '$1-').ToUpperInvariant()
        Write-Host "No address after $AddressWaitMinutes minutes. Look for the MAC address $mac in your router's DHCP leases."
        Write-Host "Its console in Hyper-V Manager shows the first boot's progress. Then:"
        Write-Host "  ssh $AdminUser@<the VM's address>"
    }
    Write-Host '  cloud-init status --wait     # until the first boot is done; then sign in again, for the docker group'
    Write-Host '  ring-bridge-setup            # your Ring login and 2FA: only you type these'
    Write-Host '  ring-bridge-start'
    Write-Host '  docker logs ring-bridge-connector   # the enrollment code, to approve on the admin page'
}

if (-not $Apply) {
    Show-Plan
    exit 0
}
Invoke-Apply
Write-Host ''
Write-Host 'Done.'
