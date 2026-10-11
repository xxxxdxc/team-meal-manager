param(
  [Parameter(Mandatory=$true,Position=0)]
  [ValidateSet('pick-store','places','doctor','init','show','profiles','profile-save','shops','select-store','confirm-roster','menu','detail','plan','quote','unavailable','replace','approve','submit','status','demo')][string]$Command,
  [string]$Task,[string]$InputFile,[string]$Query,[string]$Product,[string]$Team,[string]$Brand,[string]$TakeWay,
  [string]$ProjectRoot=$env:TEAM_MEAL_PROJECT,[switch]$Connect,[switch]$NoOpen
)
$ErrorActionPreference='Stop'
if(-not $ProjectRoot){
  $sourceRoot=Split-Path $PSScriptRoot -Parent
  if(Test-Path -LiteralPath (Join-Path $sourceRoot 'assets\runtime\src\group-cli.ts')){$ProjectRoot=$sourceRoot}
  else{$config=Join-Path (Split-Path $PSScriptRoot -Parent) 'project.json';if(Test-Path -LiteralPath $config){$ProjectRoot=(Get-Content -Raw -Encoding UTF8 -LiteralPath $config | ConvertFrom-Json).project_root}}
}
if(-not $ProjectRoot){throw 'Set TEAM_MEAL_PROJECT or pass -ProjectRoot with the standalone team-meal-manager directory.'}
$cli=Join-Path $ProjectRoot 'assets\runtime\src\group-cli.ts'
if(-not(Test-Path -LiteralPath $cli)){throw 'Standalone assets/runtime/src/group-cli.ts is missing.'}
$bun=(Get-Command bun -ErrorAction SilentlyContinue).Source
if(-not $bun){$bun=Join-Path $env:USERPROFILE '.bun\bin\bun.exe'}
if(-not(Test-Path -LiteralPath $bun)){throw 'Bun is unavailable.'}
$cliArgs=@($cli,$Command)
if($Task){$cliArgs+=@('--task',$Task)}
if($InputFile){$cliArgs+=@('--input',(Resolve-Path -LiteralPath $InputFile).Path)}
if($Query){$cliArgs+=@('--query',$Query)}
if($Product){$cliArgs+=@('--product',$Product)}
if($Team){$cliArgs+=@('--team',$Team)}
if($Brand){$cliArgs+=@('--brand',$Brand)}
if($TakeWay){$cliArgs+=@('--take-way',$TakeWay)}
if($NoOpen){$cliArgs+=@('--open','false')}
if($Connect){$cliArgs+=@('--connect','true')}
& $bun @cliArgs
exit $LASTEXITCODE
