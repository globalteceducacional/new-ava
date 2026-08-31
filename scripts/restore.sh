#!/usr/bin/env bash
# Restaura um backup gerado por backup.sh
# Uso: ./scripts/restore.sh [STAMP|LATEST]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_ROOT="${BACKUP_DIR:-$ROOT/backups}"
STAMP="${1:-}"
if [[ -z "$STAMP" || "$STAMP" == "LATEST" ]]; then
  STAMP="$(cat "$BACKUP_ROOT/LATEST")"
fi
SRC="$BACKUP_ROOT/$STAMP"
[[ -d "$SRC" ]] || { echo "Backup não encontrado: $SRC" >&2; exit 1; }

ENV_FILE="${ENV_FILE:-$ROOT/.env.prod}"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

POSTGRES_USER="${POSTGRES_USER:-ava}"
POSTGRES_DB="${POSTGRES_DB:-ava}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-ava-postgres}"

echo "[restore] Postgres a partir de $SRC/postgres.dump"
if docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
  cat "$SRC/postgres.dump" | docker exec -i "$POSTGRES_CONTAINER" \
    pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists || true
else
  echo "Container $POSTGRES_CONTAINER não está rodando" >&2
  exit 1
fi

if [[ -d "$SRC/minio" ]] && [[ ! -f "$SRC/minio/SKIPPED.txt" ]] && command -v mc >/dev/null 2>&1; then
  echo "[restore] MinIO"
  ENDPOINT="${MINIO_ENDPOINT:-localhost}"
  PORT="${MINIO_PORT:-9000}"
  SSL="${MINIO_USE_SSL:-false}"
  PROTO="http"
  [[ "$SSL" == "true" ]] && PROTO="https"
  mc alias set avarestore "${PROTO}://${ENDPOINT}:${PORT}" \
    "${MINIO_ACCESS_KEY:?}" "${MINIO_SECRET_KEY:?}" >/dev/null
  mc mirror --overwrite "$SRC/minio/" "avarestore/${MINIO_BUCKET:-ava-media}"
fi

echo "[restore] ok: $STAMP"
