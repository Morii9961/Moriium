param(
    [Parameter(Mandatory = $true)][string]$Repository,
    [Parameter(Mandatory = $true)][string]$DataDirectory,
    [Parameter(Mandatory = $true)][string]$CodexExecutable,
    [Parameter(Mandatory = $true)][string]$CcusageCli,
    [string]$TaskName = 'Moriium activity sync'
)
$ErrorActionPreference = 'Stop'
$repoPath = (Resolve-Path -LiteralPath $Repository).Path
$dataPath = (Resolve-Path -LiteralPath $DataDirectory).Path
$nodePath = (Get-Command node.exe).Source
$powerShellPath = (Get-Command pwsh.exe).Source
$wrapper = Join-Path $PSScriptRoot 'run-activity-sync.ps1'
# The wrapper uses process-scoped variables; no global account environment changes.
$arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -File "{0}" -Repository "{1}" -DataDirectory "{2}" -NodeExecutable "{3}" -CodexExecutable "{4}" -CcusageCli "{5}"' -f $wrapper, $repoPath, $dataPath, $nodePath, $CodexExecutable, $CcusageCli
$action = New-ScheduledTaskAction -Execute $powerShellPath -Argument $arguments -WorkingDirectory $repoPath
$logon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$logon.Delay = 'PT15M'
$hourly = New-ScheduledTaskTrigger -Once -At (Get-Date).AddHours(1) -RepetitionInterval (New-TimeSpan -Hours 1)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($logon, $hourly) -Settings $settings -Principal $principal
