# Run the private-app linking spike in the foreground on the home computer.
[CmdletBinding()]
param([Parameter(Mandatory)][Alias('CredentialCsv')][string]$CsvPath, [string]$SnapshotDevice, [switch]$BrowserCode, [string]$AccountHint,
      [string]$EventDevice, [ValidateSet('ding','motion')][string]$EventKind, [string]$EventId)
$ErrorActionPreference = 'Stop'
$entry = Join-Path $PSScriptRoot '../../bridge/dev/ring-pilot/main.ts'
$rows = @(Import-Csv -LiteralPath $CsvPath -Header Key,Value)
$processInfo = [System.Diagnostics.ProcessStartInfo]::new()
$processInfo.FileName = (Get-Command node -CommandType Application | Select-Object -First 1).Source
$processInfo.UseShellExecute = $false
$processInfo.ArgumentList.Add((Resolve-Path -LiteralPath $entry).Path)
$processInfo.Environment['RING_PILOT_PRIVATE_DIR'] = Split-Path -Parent (Resolve-Path -LiteralPath $CsvPath).Path
if ($EventDevice -or $EventKind -or $EventId) {
    if (!$EventDevice -or !$EventKind -or $BrowserCode -or $SnapshotDevice) { throw 'Use -EventDevice and -EventKind together for a local event probe.' }
    foreach ($argument in @('--event-probe', $EventDevice, $EventKind, [string]$EventId, [string]$AccountHint)) {
        $processInfo.ArgumentList.Add($argument)
    }
} elseif ($BrowserCode) {
    $processInfo.ArgumentList.Add('--browser-code')
    if ($AccountHint) { $processInfo.ArgumentList.Add($AccountHint) }
}
if ($SnapshotDevice) {
    $directory = Split-Path -Parent (Resolve-Path -LiteralPath $CsvPath).Path
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
