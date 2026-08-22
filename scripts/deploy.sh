#!/usr/bin/env bash
# Build + deploy do portal para o pacote global (openportal).
#
# Faz: bun install check -> build -> copia .output para
# ~/.bun/install/global/node_modules/openportal/web/{server,public}
# -> mata os processos antigos.
#
# O restart é manual:
#   term-cli run --session portal "bunx openportal" --timeout 20
#
# O patch de auth NÃO é mais necessário: o fix de Basic Auth está nativo
# no fonte desde o merge de fix/basic-auth-support (commit a5815bd).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT/apps/web"
GLOBAL_WEB="$HOME/.bun/install/global/node_modules/openportal/web"

cd "$WEB_DIR"
bun run build

cp -r .output/server/. "$GLOBAL_WEB/server/"
cp -r .output/public/assets/* "$GLOBAL_WEB/public/assets/"

WEBPID=$(pgrep -f "openportal/web/server/index.mjs" | head -1 || true)
OPENPID=$(pgrep -f "opencode serve" | head -1 || true)
if [[ -n "${WEBPID:-}" || -n "${OPENPID:-}" ]]; then
  kill -9 ${WEBPID:-} ${OPENPID:-} 2>/dev/null || true
  sleep 2
fi

NEW_HASH=$(grep -rhoE 'index-[A-Za-z0-9_-]+\.js' "$GLOBAL_WEB/public/assets" 2>/dev/null | head -1 || true)
echo
echo "Deploy concluído. Bundle principal: ${NEW_HASH:-?}"
echo "Subir com: term-cli run --session portal \"bunx openportal\" --timeout 20"
echo "Verificar depois de subir: curl -s http://localhost:3000/ | grep -oE 'src=\"[^\"]+\\.js\"' | head -1"
