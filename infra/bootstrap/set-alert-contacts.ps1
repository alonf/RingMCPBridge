#Requires -Version 7.2
<#
.SYNOPSIS
Set the bridge health alert's email and SMS recipients for the next deployment.
.EXAMPLE
pwsh -File infra/bootstrap/set-alert-contacts.ps1 -GitHubRepo 'owner/repo'
#>
[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')]
    [string] $GitHubRepo
)

$ErrorActionPreference = 'Stop'
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Host 'Install GitHub CLI from https://cli.github.com/ (on Windows: winget install --id GitHub.cli).'
    Write-Host 'Open a new terminal, run gh auth login --hostname github.com, then run this script again.'
    exit 1
}

gh auth status --active --hostname github.com *> $null
if ($LASTEXITCODE -ne 0) {
    if ((Read-Host 'GitHub login is required. Start gh auth login now? [y/N]') -notin 'y', 'yes') {
        Write-Host 'Run gh auth login --hostname github.com when ready, then rerun this script.'
        exit 1
    }
    gh auth login --hostname github.com --web
    if ($LASTEXITCODE -ne 0) { throw 'GitHub login failed. Rerun the script after signing in.' }
}

if (-not $GitHubRepo) {
    $GitHubRepo = gh repo view --json nameWithOwner --jq .nameWithOwner
    if ($LASTEXITCODE -ne 0 -or -not $GitHubRepo) {
        throw 'Run this script from your bridge clone or pass -GitHubRepo owner/repo.'
    }
}
$target = "github.com/$GitHubRepo"
if ((Read-Host "Set the three alert secrets in $target (production)? [y/N]") -notin 'y', 'yes') {
    Write-Host 'Cancelled before changing any secrets.'
    return
}

do {
    $email = (Read-Host 'Alert email address (hidden, leave empty to cancel)' -MaskInput).Trim()
    if (-not $email) { return }
    $address = $null
    $validEmail = [Net.Mail.MailAddress]::TryCreate($email, [ref] $address) -and
        $address.Address -ceq $email -and $address.Host.Contains('.')
    if (-not $validEmail) { Write-Host 'Enter one email address, such as name@example.org.' }
} until ($validEmail)

do {
    $phone = (Read-Host 'SMS number (hidden). Separate the country code with a space, e.g. +1 202-555-0147. Leave empty to cancel' -MaskInput).Trim()
    if (-not $phone) { return }
    $validPhone = $phone -match '^\+(?<code>[1-9][0-9]{0,2})\s+(?<number>[0-9][0-9 -]*)$'
    if ($validPhone) {
        $countryCode = $Matches.code
        $nationalNumber = $Matches.number -replace '[ -]', ''
        if ($countryCode -eq '972') { $nationalNumber = $nationalNumber -replace '^0', '' }
        $validPhone = $nationalNumber.Length -ge 4 -and ($countryCode + $nationalNumber).Length -le 15
    }
    if (-not $validPhone) { Write-Host 'Use +countrycode, a space, then the national number in international format.' }
} until ($validPhone)

$contacts = [ordered]@{
    BRIDGE_ALERT_EMAIL = $email
    BRIDGE_ALERT_SMS_COUNTRY_CODE = $countryCode
    BRIDGE_ALERT_SMS_NUMBER = $nationalNumber
}
foreach ($name in $contacts.Keys) {
    # gh reads the value from stdin. Process arguments and terminal output contain only the name.
    $contacts[$name] | gh secret set $name --repo $target --env production
    if ($LASTEXITCODE -ne 0) {
        throw "Could not set $name. Check access to the production environment, then rerun to set all three secrets."
    }
}
Write-Host "Saved all three alert secrets in $target (production). The next deployment applies them."
