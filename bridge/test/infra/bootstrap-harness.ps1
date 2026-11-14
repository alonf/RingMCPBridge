# Runs infra/bootstrap/bootstrap.ps1 against stand-ins for az, gh and node, and for the owner's
# answers (T031). Nothing here reaches Azure or GitHub. The test hands in, through the environment:
# - BOOTSTRAP_ARGS: the script's parameters, as a JSON object;
# - BOOTSTRAP_WORLD: rules as a JSON array of { tool, match, output, exit }, the first whose tool
#   matches and whose `match` (a -like pattern) matches the call's arguments wins; no rule answers
#   with nothing and exit code 0;
# - BOOTSTRAP_ANSWERS: what the owner types at each question in turn, comma-separated; the last
#   answer repeats.
# Each call is printed as `CALL <tool> <arguments>`, then the script's exit code as `EXIT <code>`.
# The stand-ins read the rules and answers through PowerShell's dynamic scoping: they are called
# from inside the bootstrap, which runs in a child scope of this script.
param([Parameter(Mandatory)] [string] $ScriptPath)

$ErrorActionPreference = 'Stop'
$BootstrapRules = @($env:BOOTSTRAP_WORLD | ConvertFrom-Json)
$BootstrapAnswers = [System.Collections.Generic.Queue[string]]::new([string[]] ($env:BOOTSTRAP_ANSWERS -split ','))

function global:Invoke-StandIn([string] $Tool, [object[]] $Arguments) {
    $line = ($Arguments | ForEach-Object { [string] $_ }) -join ' '
    Write-Host "CALL $Tool $line"
    foreach ($rule in $BootstrapRules) {
        if ($rule.tool -eq $Tool -and $line -like $rule.match) {
            $global:LASTEXITCODE = [int] $rule.exit
            return $rule.output
        }
    }
    $global:LASTEXITCODE = 0
    return ''
}

function global:az { Invoke-StandIn 'az' $args }
function global:gh { Invoke-StandIn 'gh' $args }
function global:node { Invoke-StandIn 'node' $args }
function global:Read-Host {
    param([string] $Prompt)
    Write-Host "ASK $Prompt"
    if ($BootstrapAnswers.Count -gt 1) { return $BootstrapAnswers.Dequeue() }
    return $BootstrapAnswers.Peek()
}

$arguments = $env:BOOTSTRAP_ARGS | ConvertFrom-Json -AsHashtable
$global:LASTEXITCODE = 0
try {
    & $ScriptPath @arguments
    Write-Host "EXIT $global:LASTEXITCODE"
}
catch {
    Write-Host "FAILED $($_.Exception.Message)"
    Write-Host 'EXIT 1'
}
