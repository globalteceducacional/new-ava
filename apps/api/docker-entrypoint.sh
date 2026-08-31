#!/bin/sh
set -e
echo "[ava-api] aplicando migrations…"
npx prisma migrate deploy
echo "[ava-api] iniciando…"
exec "$@"
