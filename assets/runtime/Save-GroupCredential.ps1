param([Parameter(Mandatory=$true)][ValidateSet('luckin','mcd')][string]$Brand)
$ErrorActionPreference='Stop'
Import-Module "$env:WINDIR\System32\WindowsPowerShell\v1.0\Modules\Microsoft.PowerShell.Security" -ErrorAction Stop
$target=Join-Path $PSScriptRoot "data\$Brand-token.dpapi"
New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
$secure=Read-Host "Enter $Brand bearer token (without Bearer prefix)" -AsSecureString
$secure | ConvertFrom-SecureString | Set-Content -LiteralPath $target -Encoding ascii
Write-Output "$Brand credential encrypted for the current Windows user."
