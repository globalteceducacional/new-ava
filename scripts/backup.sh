#!/usr/bin/env bash
# Backup Postgres + snapshot MinIO (mc) com timestamp.
# Uso (prod): ./scripts/backup.sh
# Requer: pg_dump ou docker; opcionalmente mc (MinIO client).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_ROOT="${BACKUP_DIR:-$ROOT/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_ROOT/$STAMP"
mkdir -p "$OUT"

ENV_FILE="${ENV_FILE:-$ROOT/.env.prod}"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

POSTGRES_USER="${POSTGRES_USER:-ava}"
POSTGRES_DB="${POSTGRES_DB:-ava}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-ava-postgres}"

echo "[backup] Postgres → $OUT/postgres.dump"
if docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
  docker exec -t "$POSTGRES_CONTAINER" \
    pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > "$OUT/postgres.dump"
elif command -v pg_dump >/dev/null 2>&1; then
  pg_dump "${DATABASE_URL:?DATABASE_URL ou container necessário}" -Fc -f "$OUT/postgres.dump"
else
  echo "pg_dump/container indisponível" >&2
  exit 1
fi

echo "[backup] MinIO → $OUT/minio/"
mkdir -p "$OUT/minio"
if command -v mc >/dev/null 2>&1; then
  ENDPOINT="${MINIO_ENDPOINT:-localhost}"
  PORT="${MINIO_PORT:-9000}"
  SSL="${MINIO_USE_SSL:-false}"
  PROTO="http"
  [[ "$SSL" == "true" ]] && PROTO="https"
  mc alias set avabackup "${PROTO}://${ENDPOINT}:${PORT}" \
    "${MINIO_ACCESS_KEY:?}" "${MINIO_SECRET_KEY:?}" >/dev/null
  mc mirror "avabackup/${MINIO_BUCKET:-ava-media}" "$OUT/minio/" || true
else
  echo "[backup] mc não encontrado — pulando espelho MinIO (instale MinIO Client)"
  echo "skipped" > "$OUT/minio/SKIPPED.txt"
fi

echo "$STAMP" > "$BACKUP_ROOT/LATEST"
echo "[backup] ok: $OUT"
