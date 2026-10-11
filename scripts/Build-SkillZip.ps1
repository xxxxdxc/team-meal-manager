param([string]$Output)
$ErrorActionPreference='Stop'
$repoRoot=Split-Path $PSScriptRoot -Parent
if(-not $Output){$Output=Join-Path $repoRoot 'dist\team-meal-manager.zip'}
$staging=Join-Path $env:TEMP ('team-meal-skill-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $staging,(Split-Path $Output) | Out-Null
foreach($file in @('SKILL.md','README.md','VALIDATION.md','LICENSE','package.json','bun.lock','tsconfig.json','.gitignore')){Copy-Item -LiteralPath (Join-Path $repoRoot $file) -Destination $staging}
foreach($folder in @('agents','references','scripts')){Copy-Item -LiteralPath (Join-Path $repoRoot $folder) -Destination $staging -Recurse}
$runtime=Join-Path $staging 'assets\runtime'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
foreach($folder in @('src','public')){Copy-Item -LiteralPath (Join-Path $repoRoot "assets\runtime\$folder") -Destination $runtime -Recurse}
foreach($file in @('Save-GroupCredential.ps1','Save-MapCredential.ps1')){Copy-Item -LiteralPath (Join-Path $repoRoot "assets\runtime\$file") -Destination $runtime}
Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $Output -Force
Write-Output "Skill ZIP created: $Output. Contains no credentials, database, node_modules or machine project.json."
