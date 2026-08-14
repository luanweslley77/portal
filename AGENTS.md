# AGENTS.md — Portal (OpenCode Portal)

## O que é

Web UI **mobile-first** para [OpenCode](https://opencode.ai) (chat com o agente de IA), projeto pessoal (fork). Monorepo Bun workspaces:

- `apps/web` — app React (TanStack Router) + servidor Nitro
- `apps/docs` — documentação
- `packages/cli` — CLI do openportal

### Remotes e branch

- `origin` — https://github.com/hosenur/portal.git (upstream)
- `fork` — https://github.com/luanweslley77/portal.git (fork de trabalho)
- Branch de trabalho: **`fix/mobile-content-clipping`**

Regras de git: **nunca** push para `origin/main`; push apenas para `fork` na branch de trabalho; **não** criar PR sem pedido explícito.

## Fluxo de desenvolvimento (loop completo)

### 1. Edição

Arquivos em `apps/web/src/` (routes em `apps/web/src/routes/`, componentes em `apps/web/src/components/`, hooks de dados em `apps/web/src/hooks/`).

### 2. Typecheck

```bash
cd apps/web && npx tsc --noEmit
```

**3 erros pré-existentes** (não mexer sem pedido; não introduzir novos):

- `src/hooks/use-opencode-events.ts:218` — TS2339: `Property 'id' does not exist` (unions de `SessionMessageAssistant*`)
- `src/hooks/use-session-messages.ts:488` — TS2353: `'id'` não existe em `SessionMessageAssistantText`
- `src/hooks/use-session-messages.ts:861` — TS2339: `Property 'id'` em `SessionMessageAssistantText`

### 3. Build

```bash
cd apps/web && bun run build
```

Vite + Nitro (preset `bun`, `nitro.config.ts`); saída em `apps/web/.output/` (server em `.output/server/`, assets em `.output/public/assets/`). Requer `bun install` prévio (bun.lock; `packageManager: bun@1.3.13`).

### 4. Deploy local — o portal roda do pacote GLOBAL, não do repo

O `bunx openportal` **não baixa do npm**: executa o binário global `~/.bun/bin/openportal` (symlink → `~/.bun/install/global/node_modules/openportal/dist/index.js`), que serve a UI de `web/server` + `web/public` **do próprio pacote global**. Por isso o build copiado para lá é o que roda. (Só o CLI `dist/` permanece o original 0.1.32.)

```bash
# 1. Copiar o build para o pacote global
cd apps/web
cp -r .output/server/. ~/.bun/install/global/node_modules/openportal/web/server/
cp -r .output/public/assets/* ~/.bun/install/global/node_modules/openportal/web/public/assets/

# 2. Reaplicar o patch de auth (o build da main NÃO tem o fix do PR #54;
#    os arquivos patchados são sobrescritos a cada build — sempre rodar)
~/.local/bin/portal-auth-patch.sh

# 3. Restart — matar os processos e subir de novo
WEBPID=$(pgrep -f "openportal/web/server/index.mjs" | head -1)
OPENPID=$(pgrep -f "opencode serve" | head -1)
kill -9 $WEBPID $OPENPID 2>/dev/null
sleep 2
# Processos longos: usar term-cli (o bash tool mata no timeout)
term-cli run --session portal "bunx openportal" --timeout 20
sleep 7

# 4. Verificar que o build novo está sendo servido (o hash muda a cada build)
curl -s http://localhost:3000/ | grep -oE 'src="[^"]+\.js"' | head -1
```

### 5. Validação visual (chrome devtools)

- Emulações: mobile **390x844** (deviceScaleFactor 2, touch) e desktop **1280x800**
- Reload **sempre com `ignoreCache`** (assets imutáveis ficam em cache)
- Navegação: `/instances` → instância OPENCODE → uma sessão (ex: `ses_0055986e...`)
- Simular digitação: `Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, texto)` + `dispatchEvent(new Event('input', { bubbles: true }))` — só `ta.value = x` não atualiza o React (valor controlado)
- Re-emular o viewport ao abrir página nova (emulação é por página) e recomeçar do `/instances`

### 6. Commit + push

```bash
git add -A && git commit -m "tipo(web): resumo do problema/causa/fix"
git push fork fix/mobile-content-clipping
```

Mensagens no padrão da sessão: `fix(web)`, `feat(web)`, `style(web)`, `docs:` — com descrição do problema, causa e fix (ex: "fix(web): stable wrapper detection, no mode oscillation").

## Arquitetura (pontos-chave)

- **Nitro**: `nitro.config.ts` (preset `bun`, `serverDir "."`); API em `apps/web/src/server/`; no build viram `_routes` dentro de `.output/server/`.
- **Front**: TanStack Router, IntentUI (react-aria-components), Tailwind v4 (`@tailwindcss/vite`), SWR (dados), `@opencode-ai/sdk`.
- **Composer (textarea)** — arquitetura estilo ChatGPT (ver `SPEC_patch.md` §9 para a evolução completa):
  - Caixa com borda/ring (`focus-within`) → wrapper de scroll (`max-h-60 overflow-y-auto` + `pb-12` condicional quando `wrapped`) → textarea com `field-sizing-content` (cresce livre, sem max próprio)
  - Botões absolute na base: clipe (`left-1 bottom-1 z-10`), enviar (`right-2 bottom-1`)
  - Estado `wrapped`: detecção de quebra de linha (Enter OU wrap automático) via textarea de medição **oculto** (`measureRef`, largura fixa do modo 1 linha = `wrapper.clientWidth − 96px`) — estável, sem oscilação
  - Modo 1 linha: `min-h-11 pt-3 pb-1 pl-11! pr-13!` (texto entre os botões); modo wrapper: `min-h-12 py-2` (padding simétrico do componente)
- **`SPEC_patch.md`** (raiz): documento vivo de bugs/correções da UI — atualizar com seção nova a cada correção relevante.

## Convenções

- TypeScript em tudo; componentes em `apps/web/src/components/`; Tailwind; alias `@/` → `apps/web/src`
- Ao sobrescrever classes do componente base (ex: `ui/textarea.tsx` tem `sm:px/py` que vencem na cascade em ≥640px), usar **`!`** (important) no className do chamador — já causou bug real
- Não usar python/pip diretamente (usar uv) — exceção: `~/.local/bin/portal-auth-patch.sh` (pronto, python3 embutido)
- Dev: `bun dev` na raiz (turbo) ou `cd apps/web && bunx vite`
