param([Parameter(Mandatory=$true)][ValidateSet('luckin','mcd')][string]$Brand)
$ErrorActionPreference='Stop'
if(-not(Get-Command ConvertFrom-SecureString -ErrorAction SilentlyContinue)){Import-Module Microsoft.PowerShell.Security -ErrorAction Stop}
$target=Join-Path $PSScriptRoot "data\$Brand-token.dpapi"
New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
$secure=Read-Host "Enter $Brand bearer token (without Bearer prefix)" -AsSecureString
$secure | ConvertFrom-SecureString | Set-Content -LiteralPath $target -Encoding ascii
Write-Output "$Brand credential encrypted for the current Windows user."
