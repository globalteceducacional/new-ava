# Backup Postgres (Windows / Docker Desktop)
# Uso: powershell -File .\scripts\backup.ps1
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$BackupRoot = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { Join-Path $Root 'backups' }
$Stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$Out = Join-Path $BackupRoot $Stamp
New-Item -ItemType Directory -Force -Path $Out | Out-Null

$Container = if ($env:POSTGRES_CONTAINER) { $env:POSTGRES_CONTAINER } else { 'ava-postgres' }
$User = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'ava' }
$Db = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { 'ava' }
$DumpHost = Join-Path $Out 'postgres.dump'
$DumpContainer = '/tmp/ava-backup.dump'

Write-Host "[backup] Postgres → $DumpHost"
docker exec $Container pg_dump -U $User -Fc -f $DumpContainer $Db
docker cp "${Container}:${DumpContainer}" $DumpHost
docker exec $Container rm -f $DumpContainer | Out-Null

$Skip = Join-Path $Out 'minio'
New-Item -ItemType Directory -Force -Path $Skip | Out-Null
'skipped' | Set-Content (Join-Path $Skip 'SKIPPED.txt')
Write-Host '[backup] MinIO: use scripts/backup.sh com mc no Linux/prod'

$Stamp | Set-Content (Join-Path $BackupRoot 'LATEST')
Write-Host "[backup] ok: $Out"
