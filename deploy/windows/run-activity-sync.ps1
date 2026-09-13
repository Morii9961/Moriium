param(
    [Parameter(Mandatory = $true)][string]$Repository,
    [Parameter(Mandatory = $true)][string]$DataDirectory,
    [Parameter(Mandatory = $true)][string]$NodeExecutable,
    [Parameter(Mandatory = $true)][string]$CodexExecutable,
    [Parameter(Mandatory = $true)][string]$CcusageCli
)
$ErrorActionPreference = 'Stop'
$env:MORIIUM_ACTIVITY_WORK = $DataDirectory
$env:MORIIUM_CODEX_CLI = $CodexExecutable
$env:MORIIUM_CCUSAGE_CLI = $CcusageCli
Set-Location -LiteralPath $Repository
$logPath = Join-Path $DataDirectory 'sync.log'
& $NodeExecutable 'scripts/activity-sync.mjs' >> $logPath 2>&1
exit $LASTEXITCODE
