#!/usr/bin/env bash
# Ciclo backup → restore → query de sanidade (contagem User).
# Uso local (infra docker): ./scripts/restore-test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-ava-postgres}"
POSTGRES_USER="${POSTGRES_USER:-ava}"
POSTGRES_DB="${POSTGRES_DB:-ava}"

echo "[restore-test] backup…"
bash "$ROOT/scripts/backup.sh"

echo "[restore-test] contagem ANTES"
BEFORE="$(docker exec -t "$POSTGRES_CONTAINER" \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc 'SELECT COUNT(*) FROM users;' | tr -d '[:space:]')"

echo "[restore-test] restore LATEST…"
bash "$ROOT/scripts/restore.sh" LATEST

echo "[restore-test] contagem DEPOIS"
AFTER="$(docker exec -t "$POSTGRES_CONTAINER" \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc 'SELECT COUNT(*) FROM users;' | tr -d '[:space:]')"

echo "users before=$BEFORE after=$AFTER"
if [[ "$BEFORE" != "$AFTER" ]]; then
  echo "Falha: contagem divergente" >&2
  exit 1
fi
if [[ -z "$AFTER" || "$AFTER" == "0" ]]; then
  echo "Aviso: 0 users — rode seed se for ambiente vazio"
fi
echo "[restore-test] ok"
