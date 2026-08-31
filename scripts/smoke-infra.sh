#!/usr/bin/env bash
# Smoke test da infraestrutura local (Postgres, Redis, MinIO).
# Exit 0 se todos estiverem saudáveis; != 0 caso contrário.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Carrega .env se existir (sem exportar tudo de forma insegura em produção)
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-ava}"
POSTGRES_DB="${POSTGRES_DB:-ava}"
REDIS_PORT="${REDIS_PORT:-6379}"
MINIO_API_PORT="${MINIO_API_PORT:-9000}"

fail=0

echo "==> Checando Postgres..."
if docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
  echo "    OK  postgres"
else
  echo "    FAIL postgres"
  fail=1
fi

echo "==> Checando Redis..."
if docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
  echo "    OK  redis"
else
  echo "    FAIL redis"
  fail=1
fi

echo "==> Checando MinIO..."
if curl -sf "http://localhost:${MINIO_API_PORT}/minio/health/live" >/dev/null; then
  echo "    OK  minio"
else
  echo "    FAIL minio"
  fail=1
fi

if [[ "$fail" -ne 0 ]]; then
  echo ""
  echo "Smoke infra FALHOU. Suba os serviços com:"
  echo "  docker compose up -d postgres redis minio"
  exit 1
fi

echo ""
echo "Smoke infra OK."
exit 0
