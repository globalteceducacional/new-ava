# Restore Postgres a partir de backups\<stamp>\postgres.dump
# Uso: powershell -File .\scripts\restore.ps1 [-Stamp LATEST]
param([string]$Stamp = 'LATEST')
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$BackupRoot = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { Join-Path $Root 'backups' }
if ($Stamp -eq 'LATEST') {
  $Stamp = (Get-Content (Join-Path $BackupRoot 'LATEST') -Raw).Trim()
}
$Src = Join-Path $BackupRoot $Stamp
$Dump = Join-Path $Src 'postgres.dump'
if (-not (Test-Path $Dump)) { throw "Backup não encontrado: $Dump" }

$Container = if ($env:POSTGRES_CONTAINER) { $env:POSTGRES_CONTAINER } else { 'ava-postgres' }
$User = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'ava' }
$Db = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { 'ava' }
$DumpContainer = '/tmp/ava-restore.dump'

Write-Host "[restore] $Dump → $Container"
docker cp $Dump "${Container}:${DumpContainer}"
docker exec $Container pg_restore -U $User -d $Db --clean --if-exists $DumpContainer
docker exec $Container rm -f $DumpContainer | Out-Null
Write-Host "[restore] ok: $Stamp"
