# Run the private-app linking spike in the foreground on the home computer.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$CredentialCsv, [string]$SnapshotDevice)
$ErrorActionPreference = 'Stop'
$entry = Join-Path $PSScriptRoot '../../bridge/dev/ring-pilot/main.ts'
$rows = @(Import-Csv -LiteralPath $CredentialCsv -Header Key,Value)
$processInfo = [System.Diagnostics.ProcessStartInfo]::new()
$processInfo.FileName = (Get-Command node -CommandType Application | Select-Object -First 1).Source
$processInfo.UseShellExecute = $false
$processInfo.ArgumentList.Add((Resolve-Path -LiteralPath $entry).Path)
if ($SnapshotDevice) {
    $directory = Split-Path -Parent (Resolve-Path -LiteralPath $CredentialCsv).Path
    $processInfo.Environment['RING_PILOT_SNAPSHOT_DIR'] = $directory
    $processInfo.Environment['RING_PILOT_SNAPSHOT_DEVICE'] = $SnapshotDevice
}
$fields = @{
    'Client ID' = 'RING_PILOT_ID'
    'Client Secret' = 'RING_PILOT_SECRET'
    'HMAC Signature Key' = 'RING_PILOT_SIGNING_KEY'
}
foreach ($label in $fields.Keys) {
    $matchesForKey = @($rows | Where-Object { $_.Key.Trim() -eq $label })
    if ($matchesForKey.Count -ne 1 -or [string]::IsNullOrWhiteSpace($matchesForKey[0].Value)) {
        throw "Expected exactly one nonempty '$label' entry in the Ring credentials CSV."
    }
    $processInfo.Environment[$fields[$label]] = $matchesForKey[0].Value.Trim()
}
$pilotProcess = [System.Diagnostics.Process]::Start($processInfo)
try {
    while (-not $pilotProcess.WaitForExit(500)) { }
    if ($pilotProcess.ExitCode -ne 0) { throw 'The Ring pilot stopped with an error.' }
} finally {
    if (-not $pilotProcess.HasExited) { $pilotProcess.Kill() }
    $pilotProcess.Dispose()
}
