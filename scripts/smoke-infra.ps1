# Smoke test da infraestrutura local (Postgres, Redis, MinIO) — PowerShell.
# Exit 0 se todos estiverem saudáveis; != 0 caso contrário.

$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (Test-Path .env) {
  Get-Content .env | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    $parts = $_.Split('=', 2)
    if ($parts.Length -eq 2) {
      [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), 'Process')
    }
  }
}

$PostgresUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'ava' }
$PostgresDb = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { 'ava' }
$MinioPort = if ($env:MINIO_API_PORT) { $env:MINIO_API_PORT } else { '9000' }

$fail = 0

Write-Host '==> Checando Postgres...'
docker compose exec -T postgres pg_isready -U $PostgresUser -d $PostgresDb 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  Write-Host '    OK  postgres'
} else {
  Write-Host '    FAIL postgres'
  $fail = 1
}

Write-Host '==> Checando Redis...'
$pong = docker compose exec -T redis redis-cli ping 2>$null
if ($pong -match 'PONG') {
  Write-Host '    OK  redis'
} else {
  Write-Host '    FAIL redis'
  $fail = 1
}

Write-Host '==> Checando MinIO...'
try {
  $response = Invoke-WebRequest -Uri "http://localhost:${MinioPort}/minio/health/live" -UseBasicParsing -TimeoutSec 5
  if ($response.StatusCode -eq 200) {
    Write-Host '    OK  minio'
  } else {
    Write-Host '    FAIL minio'
    $fail = 1
  }
} catch {
  Write-Host '    FAIL minio'
  $fail = 1
}

if ($fail -ne 0) {
  Write-Host ''
  Write-Host 'Smoke infra FALHOU. Suba os serviços com:'
  Write-Host '  docker compose up -d postgres redis minio'
  exit 1
}

Write-Host ''
Write-Host 'Smoke infra OK.'
exit 0
