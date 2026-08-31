# Ciclo backup → restore → sanidade (COUNT users)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot 'backup.ps1')
$Container = if ($env:POSTGRES_CONTAINER) { $env:POSTGRES_CONTAINER } else { 'ava-postgres' }
$User = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'ava' }
$Db = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { 'ava' }
$Before = (docker exec -t $Container psql -U $User -d $Db -tAc 'SELECT COUNT(*) FROM users;').Trim()
& (Join-Path $PSScriptRoot 'restore.ps1') -Stamp LATEST
$After = (docker exec -t $Container psql -U $User -d $Db -tAc 'SELECT COUNT(*) FROM users;').Trim()
Write-Host "users before=$Before after=$After"
if ($Before -ne $After) { throw 'Contagem divergente' }
Write-Host '[restore-test] ok'
