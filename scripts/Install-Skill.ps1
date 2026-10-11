param([string]$Destination=(Join-Path $env:USERPROFILE '.codex\skills\team-meal-manager'))
$ErrorActionPreference='Stop'
$repoRoot=Split-Path $PSScriptRoot -Parent
if(-not(Test-Path -LiteralPath (Join-Path $repoRoot 'assets\runtime\src\group-cli.ts'))){throw 'Standalone runtime missing'}
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
Copy-Item -LiteralPath (Join-Path $repoRoot 'SKILL.md') -Destination $Destination
foreach($folder in @('agents','references','scripts')){
  $target=Join-Path $Destination $folder
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  Copy-Item -Path (Join-Path $repoRoot "$folder\*") -Destination $target -Recurse -Force
}
@{project_root=$repoRoot} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Destination 'project.json') -Encoding utf8
Write-Output "Installed skill at $Destination; runtime at $repoRoot"
