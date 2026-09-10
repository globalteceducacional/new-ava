#!/usr/bin/env bash
# Exemplo de UFW na VPS do AVA.
# Ajuste a interface SSH se precisar (não se trave fora da máquina).
#
# Uso (root):
#   sudo bash deploy/ufw-ava.example.sh
set -euo pipefail

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp

# MinIO: API S3 e console. GetObject anônimo em hls/* no bucket —
# se 9000 estiver aberto na internet, qualquer um baixa o HLS sem JWT.
ufw deny 9000/tcp
ufw deny 9001/tcp

# Postgres / Redis / API / web do compose de produção não devem estar
# no firewall público. Deny explícito caso um compose antigo tenha publicado.
ufw deny 5432/tcp
ufw deny 6379/tcp
ufw deny 3000/tcp
ufw deny 3001/tcp

ufw --force enable
ufw status verbose
