#!/usr/bin/env bash
# Gera segredos fortes e atualiza .env.prod (não sobrescreve domínio/URLs).
# Uso (na raiz do repo):
#   cp .env.prod.example .env.prod
#   bash scripts/gen-prod-secrets.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env.prod"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT/.env.prod.example" "$ENV_FILE"
  echo "Criado .env.prod a partir do example."
fi

gen() {
  openssl rand -base64 "$1" | tr -d '+/=\n' | cut -c1-"$2"
}

POSTGRES_PASSWORD="$(gen 32 40)"
REDIS_PASSWORD="$(gen 32 40)"
MINIO_ACCESS_KEY="ava$(gen 16 12)"
MINIO_SECRET_KEY="$(gen 48 48)"
JWT_SECRET="$(gen 64 64)"
SEED_PASSWORD="$(gen 24 24)"

set_key() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    # portable-ish replace
    tmp="$(mktemp)"
    awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $1==k{$0=k"="v} {print}' "$ENV_FILE" >"$tmp"
    mv "$tmp" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >>"$ENV_FILE"
  fi
}

set_key POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
set_key REDIS_PASSWORD "$REDIS_PASSWORD"
set_key MINIO_ACCESS_KEY "$MINIO_ACCESS_KEY"
set_key MINIO_SECRET_KEY "$MINIO_SECRET_KEY"
set_key JWT_SECRET "$JWT_SECRET"
set_key SEED_PASSWORD "$SEED_PASSWORD"

echo
echo "Segredos gravados em .env.prod:"
echo "  POSTGRES_PASSWORD, REDIS_PASSWORD, MINIO_*, JWT_SECRET, SEED_PASSWORD"
echo
echo "Ainda falta ajustar manualmente (domínio real):"
echo "  AVA_DOMAIN, CADDY_ACME_EMAIL, WEB_ORIGIN, NEXT_PUBLIC_API_URL, MEDIA_PUBLIC_BASE_URL"
echo
echo "SEED_PASSWORD (guarde para o 1º login; troque depois):"
echo "  $SEED_PASSWORD"
