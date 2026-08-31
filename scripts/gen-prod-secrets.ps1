# Gera segredos fortes e atualiza .env.prod (não sobrescreve domínio/URLs).
# Uso (na raiz do repo):
#   copy .env.prod.example .env.prod
#   powershell -File .\scripts\gen-prod-secrets.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env.prod'

if (-not (Test-Path $envFile)) {
  $example = Join-Path $root '.env.prod.example'
  if (-not (Test-Path $example)) {
    throw 'Nem .env.prod nem .env.prod.example encontrados.'
  }
  Copy-Item $example $envFile
  Write-Host "Criado .env.prod a partir do example."
}

function New-Secret([int]$bytes = 32) {
  $buf = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buf)
  return ([Convert]::ToBase64String($buf) -replace '[+/=]', 'x')
}

function Set-EnvKey([string]$content, [string]$key, [string]$value) {
  $line = "$key=$value"
  if ($content -match "(?m)^$([regex]::Escape($key))=") {
    return [regex]::Replace($content, "(?m)^$([regex]::Escape($key))=.*$", $line)
  }
  return $content.TrimEnd() + "`n$line`n"
}

$secrets = @{
  POSTGRES_PASSWORD = New-Secret 24
  REDIS_PASSWORD    = New-Secret 24
  MINIO_ACCESS_KEY  = ('ava' + (New-Secret 12)).Substring(0, 16)
  MINIO_SECRET_KEY  = New-Secret 32
  JWT_SECRET        = New-Secret 48
  SEED_PASSWORD     = New-Secret 18
}

$text = Get-Content -Raw -Path $envFile
foreach ($k in $secrets.Keys) {
  $text = Set-EnvKey $text $k $secrets[$k]
}

Set-Content -Path $envFile -Value $text -NoNewline -Encoding utf8

Write-Host ""
Write-Host "Segredos gravados em .env.prod:"
Write-Host "  POSTGRES_PASSWORD, REDIS_PASSWORD, MINIO_*, JWT_SECRET, SEED_PASSWORD"
Write-Host ""
Write-Host "Ainda falta ajustar manualmente (domínio real):"
Write-Host "  AVA_DOMAIN, CADDY_ACME_EMAIL, WEB_ORIGIN, NEXT_PUBLIC_API_URL, MEDIA_PUBLIC_BASE_URL"
Write-Host ""
Write-Host "SEED_PASSWORD (guarde para o 1º login; troque depois):"
Write-Host "  $($secrets.SEED_PASSWORD)"
