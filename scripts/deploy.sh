#!/usr/bin/env bash
# Build + deploy + restart do portal (openportal global).
#
# Fluxo:
#   1. build (vite + nitro) em apps/web
#   2. copia .output para o pacote global (~/.bun/install/global/.../openportal/web)
#   3. detecta TODAS as sessões term-cli/tmux que hospedam uma instância
#   4. derruba todas as instâncias (UI, CLI pai, backends `opencode serve`)
#   5. reergue cada sessão detectada (C-c + `bunx openportal`)
#   6. espera subir e valida o bundle servido em cada porta contra o build novo
#
# Sessões sem instância não são tocadas. Basic Auth é nativo desde a5815bd.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT/apps/web"
GLOBAL_WEB="$HOME/.bun/install/global/node_modules/openportal/web"
URL_BASE="http://localhost"

cd "$WEB_DIR"
bun run build

cp -r .output/server/. "$GLOBAL_WEB/server/"
cp -r .output/public/assets/* "$GLOBAL_WEB/public/assets/"

EXPECTED_HASH=$(grep -ohE 'index-[A-Za-z0-9_-]+\.js' "$GLOBAL_WEB/server/index.mjs" | head -1)

descendants() {
  local pid=$1 children c
  children=$(pgrep -P "$pid" 2>/dev/null || true)
  for c in $children; do
    echo "$c"
    descendants "$c"
  done
}

session_hosts_instance() {
  local session=$1 pane_pid d cmd
  pane_pid=$(tmux display-message -p -t "$session" '#{pane_pid}' 2>/dev/null || true)
  [[ -z "$pane_pid" ]] && return 1
  for d in $(descendants "$pane_pid"); do
    cmd=$(tr '\0' ' ' <"/proc/$d/cmdline" 2>/dev/null || true)
    case "$cmd" in
      *bin/openportal* | *web/server/index.mjs*) return 0 ;;
    esac
  done
  return 1
}

# 3. descobre quais sessões hospedam instância ("portal" tem prioridade)
mapfile -t ALL_SESSIONS < <(tmux ls -F '#{session_name}' 2>/dev/null || true)
HOSTING=()
for s in "${ALL_SESSIONS[@]}"; do
  if session_hosts_instance "$s"; then
    if [[ "$s" == "portal" ]]; then
      HOSTING=("portal" "${HOSTING[@]}")
    else
      HOSTING+=("$s")
    fi
  fi
done

# 4. derruba todas as instâncias
pkill -9 -f "openportal/web/server/index.mjs" 2>/dev/null || true
pkill -9 -f "\.bun/bin/openportal" 2>/dev/null || true
pkill -9 -f "opencode serve" 2>/dev/null || true
sleep 1

# 5. reergue cada sessão detectada (ou cria a padrão se nenhuma)
if [[ ${#HOSTING[@]} -eq 0 ]]; then
  echo "Nenhuma sessão com instância encontrada; subindo 'portal'..."
  tmux has-session -t portal 2>/dev/null || tmux new-session -d -s portal -x 120 -y 32
  HOSTING=(portal)
fi
for s in "${HOSTING[@]}"; do
  tmux send-keys -t "$s" C-c 2>/dev/null || true
  sleep 1
  tmux send-keys -t "$s" "bunx openportal" Enter
  sleep 2
done

# 6. valida cada UI web no ar
FAIL=0
for attempt in $(seq 1 30); do
  WEB_PORTS=()
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    port=$(ss -tlnp 2>/dev/null | grep "pid=$pid," | grep -oE ':[0-9]+ ' | head -1 | tr -d ': ')
    [[ -n "$port" ]] && WEB_PORTS+=("$port")
  done < <(pgrep -f "web/server/index.mjs" 2>/dev/null || true)
  [[ ${#WEB_PORTS[@]} -ge ${#HOSTING[@]} ]] && break
  sleep 1
done

echo
if [[ ${#WEB_PORTS[@]} -eq 0 ]]; then
  echo "ERRO: nenhuma UI subiu. Inspecione as sessões: term-cli list"
  exit 1
fi
for port in "${WEB_PORTS[@]}"; do
  served=$(curl -sf "$URL_BASE:$port/" | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1 || true)
  if [[ "$served" == "$EXPECTED_HASH" ]]; then
    echo "OK  :$port -> $served"
  else
    echo "FALHA :$port -> servindo '${served:-nada}', esperado $EXPECTED_HASH"
    FAIL=1
  fi
done
missing=$(( ${#HOSTING[@]} - ${#WEB_PORTS[@]} ))
if [[ $missing -gt 0 ]]; then
  echo "FALHA: $missing sessão(ões) não subiram UI (detectadas: ${HOSTING[*]})"
  FAIL=1
fi
exit $FAIL
