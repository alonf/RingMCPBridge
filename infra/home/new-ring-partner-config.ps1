# Run in the private directory that holds the Ring-issued credential CSV.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][Alias('CredentialCsv')][string]$CsvPath,
    [Parameter(Mandatory)][string]$CameraPairsFile,
    [Parameter(Mandatory)][DateTimeOffset]$ActiveFrom,
    [switch]$Container
)
$ErrorActionPreference = 'Stop'
$csv = Get-Item -LiteralPath $CsvPath
$rows = @(Import-Csv -LiteralPath $csv.FullName -Header Key,Value)
function Read-Field([string]$label) {
    $found = @($rows | Where-Object { $_.Key.Trim() -eq $label })
    if ($found.Count -ne 1 -or [string]::IsNullOrWhiteSpace($found[0].Value)) { throw "Expected one nonempty '$label' row." }
    $found[0].Value.Trim()
}
$pairs = @(Get-Content -Raw -LiteralPath $CameraPairsFile | ConvertFrom-Json)
# Windows PowerShell may leave a JSON array inside the pipeline result.
$pairs = @($pairs | ForEach-Object { $_ })
if (!$pairs.Count) { throw 'At least one camera pair is required.' }
$sources = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$targets = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$entries = foreach ($pair in $pairs) {
    $entry = [ordered]@{}
    foreach ($name in 'accountId','ringHouseholdId','ringDeviceId','locationId','deviceId') {
        $value = $pair.$name
        if ($value -isnot [string] -or [string]::IsNullOrWhiteSpace($value)) { throw "Camera pair requires '$name'." }
        $entry[$name] = $value
    }
    $source = ConvertTo-Json -Compress -InputObject @($entry.accountId,$entry.ringDeviceId)
    if (!$sources.Add($source) -or !$targets.Add($entry.deviceId)) { throw 'Each camera can be paired once.' }
    $entry.activeFrom = $ActiveFrom.UtcDateTime.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    $entry
}
$config = [ordered]@{
    clientId = Read-Field 'Client ID'
    clientSecret = Read-Field 'Client Secret'
    signingKey = Read-Field 'HMAC Signature Key'
    host = if ($Container) { '0.0.0.0' } else { '127.0.0.1' }
    pairs = @($entries)
}
$path = Join-Path $csv.DirectoryName 'ring-partner.json'
$bytes = [Text.Encoding]::UTF8.GetBytes(($config | ConvertTo-Json -Depth 5))
$tempPath = Join-Path $csv.DirectoryName ([IO.Path]::GetRandomFileName())
$stream = [IO.File]::Open($tempPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try {
    try { $stream.Write($bytes,0,$bytes.Length) } finally { $stream.Dispose() }
    [IO.File]::Move($tempPath,$path)
} finally {
    [IO.File]::Delete($tempPath)
}
Write-Output "Created the private connector configuration at $path"
