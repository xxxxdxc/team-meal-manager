$ErrorActionPreference='Stop'
if(-not(Get-Command ConvertFrom-SecureString -ErrorAction SilentlyContinue)){Import-Module Microsoft.PowerShell.Security -ErrorAction Stop}
$target=Join-Path $PSScriptRoot 'data\amap-key.dpapi'
New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
$secure=Read-Host 'Enter Amap Web Service Key (input hidden)' -AsSecureString
if($secure.Length -lt 20){throw 'Input too short: copy the Key field, not the application ID. Nothing saved.'}
$secure | ConvertFrom-SecureString | Set-Content -LiteralPath $target -Encoding ascii
Write-Output 'Amap Key encrypted for the current Windows user. No plaintext saved.'
