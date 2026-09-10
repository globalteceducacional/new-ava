#!/usr/bin/env bash
# Recria api/web na VPS (nginx do host). Uso manual:
#   sudo bash deploy/cd-on-vps.sh
# O GitHub Actions já faz git pull antes de chamar este script.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env.prod ]]; then
  echo "Falta $ROOT/.env.prod — não versionar; copie de .env.prod.example."
  exit 1
fi

docker compose \
  -f docker-compose.prod.yml \
  -f docker-compose.prod.behind-nginx.yml \
  --env-file .env.prod \
  up -d --build

docker compose \
  -f docker-compose.prod.yml \
  -f docker-compose.prod.behind-nginx.yml \
  --env-file .env.prod \
  ps
