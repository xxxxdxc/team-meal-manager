param([ValidateSet('codex','claude','workbuddy')][string]$Client='codex',[string]$Destination)
$ErrorActionPreference='Stop'
if(-not $Destination){$clientFolder=@{codex='.codex';claude='.claude';workbuddy='.workbuddy'}[$Client];$Destination=Join-Path $env:USERPROFILE "$clientFolder\skills\team-meal-manager"}
$repoRoot=Split-Path $PSScriptRoot -Parent
if(-not(Test-Path -LiteralPath (Join-Path $repoRoot 'assets\runtime\src\group-cli.ts'))){throw 'Standalone runtime missing'}
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
Copy-Item -LiteralPath (Join-Path $repoRoot 'SKILL.md') -Destination $Destination
Copy-Item -LiteralPath (Join-Path $repoRoot 'README.md') -Destination $Destination
Copy-Item -LiteralPath (Join-Path $repoRoot 'VALIDATION.md') -Destination $Destination
foreach($folder in @('agents','references','scripts')){
  $target=Join-Path $Destination $folder
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  Copy-Item -Path (Join-Path $repoRoot "$folder\*") -Destination $target -Recurse -Force
}
@{project_root=$repoRoot} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Destination 'project.json') -Encoding utf8
Write-Output "Installed $Client skill files at $Destination; runtime at $repoRoot. Host discovery still needs verification; WorkBuddy also supports ZIP import."
