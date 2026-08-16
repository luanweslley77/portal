# SPEC_patch.md — Bug de exibição no OpenPortal UI

Documento vivo da investigação/correção. Atualizado conforme descobertas.

## 1. Relato do bug

- **Sintoma:** a UI não mostra todo o conteúdo — conteúdo não cabe na tela (overflow/clipping).
- **Onde:** dentro de sessões (chat), layout responsivo **mobile** (viewport 390px).
- **Reprodutor:** chrome devtools + portal rodando local, emulação mobile 390x844.

## 2. Status

| Etapa                          | Status          |
| ------------------------------ | --------------- |
| Reprodução                     | ✅ reproduzido  |
| Causa raiz                     | ✅ identificada |
| Fix                            | ✅ aplicado     |
| Build                          | ✅ compilado    |
| Verificação visual (devtools)  | ✅ validado     |
| PR (fork luanweslley77/portal) | pendente        |

## 3. Descobertas

### 3.1 Reprodução (chrome devtools, viewport 390x844 mobile)

- Entrando em uma sessão com mensagens longas, os blocos `<pre>` (code blocks) renderizam com **largura 929px** num container de 390px.
- O pai com `overflow-x-hidden` corta o conteúdo à direita — **sem scrollbar**, conteúdo invisível.
- Elementos afetados: `div.flex-1` (929px), `div.prose` (929px), `pre` (929px), todos `right: 978` fora do viewport.

### 3.2 Causa raiz — bug clássico de flexbox (min-width: auto)

- `apps/web/src/routes/_app/session/$id.tsx:745` — `<div className="flex-1">` no `MessageItem`.
- Flex items têm `min-width: auto` por padrão → recusam encolher abaixo do `min-content` do filho.
- O `<pre>` com texto longo sem quebra (ex: linha `firewall-cmd ...`) força `min-content` de ~929px.
- Resultado: `flex-1` expande além do container; `prose` preenche; o `overflow-x-hidden` do pai corta sem dar scroll.

### 3.3 Fix

- Adicionar `min-w-0` ao flex item: `<div className="flex-1 min-w-0">` → permite encolher; o `pre` (que tem `overflow-x: auto` via tailwind typography) passa a ter scroll horizontal interno.
- Verificação: com `min-w-0`, `flex-1`/`prose` devem renderizar em ~316px e `pre.scrollWidth > pre.clientWidth` com scroll disponível.

### 3.4 Verificação pós-fix (chrome devtools, 390x844)

- Todos os `<pre>` renderizam em **316px** (dentro do viewport), antes eram 929px.
- `scrollTest`: `pre.scrollLeft` 0 → 500 → 0: **scroll horizontal funcional**.
- Tabelas: 316px, sem overflow.
- Elementos `code` largos (905px) são filhos dos `pre` com scroll interno — comportamento correto.

## 4. Melhoria: footer (composer) compacto

### 4.1 Problema

- O footer do chat (composer) ficava **grande demais**: o `Textarea` tinha `min-h-32 max-h-32` (128px) **sempre**, mesmo com o campo vazio.
- Somado a `p-4` e `mt-3`, o footer ocupava ~200px+ sem necessidade — especialmente ruim em mobile.

### 4.2 Mudanças

- `session/$id.tsx` footer container: `p-4` → `p-3`.
- Textarea: altura condicional —
  - vazio: `min-h-11 max-h-11 pb-2` (~44px, 1 linha);
  - com conteúdo: `min-h-32 max-h-32 pb-12` (comportamento anterior).
- Barra de selects (Agent/Model): `mt-3` → `mt-2`.

### 4.3 Verificação

- Vazio: footer ~90px total (antes ~200px).
- Digitando: textarea cresce (field-sizing-content) até o max-h-32 anterior.

### 4.4 Verificação pós-fix (chrome devtools, 390x844)

- **Campo vazio:** textarea `44px` (min-h-11), footer total `121px` (antes ~200px+).
- **Digitando (3 linhas):** textarea cresce para `128px` (max-h-32), footer `205px` — comportamento anterior preservado.
- Selects (Agent/Model) continuam acessíveis na barra compacta (`mt-2`).

### 4.5 Melhoria adicional: barra de selects colapsável

- **Problema:** a barra `AgentSelect` + `ModelSelect` (44px) ficava **sempre visível** abaixo do textarea — junto com o textarea, somava ~121px de footer mesmo sem digitar.
- **Fix:** estado `isComposerFocused` — a barra só renderiza quando `input.trim()` **ou** foco no textarea (`onFocus`/`onBlur`).
- **Verificação (devtools):**
  - Sem foco + vazio: footer **69px** (só textarea 44px + paddings), barra oculta.
  - Foco no textarea: barra reaparece (footer 121px) — permite trocar agent/model antes de digitar.
  - Com conteúdo: barra permanece visível.

### 4.6 Correção de rumo (feedback do usuário)

- **Usuário esclareceu:** o pedido era reduzir o espaço **abaixo** da barra de selects — não esconder a barra nem o botão de enviar.
- **Reversões:**
  - Barra Agent/Model: **sempre visível** de novo (removida a condição `isComposerFocused`).
  - Botão de enviar: **só renderiza quando `input.trim()`** — não aparece o ícone vazio/desabilitado à toa.
- **Redução real do espaço:**
  - Footer: `p-3` → `p-3 pb-2` → espaço abaixo dos selects: **8px** (era 16px).
  - Barra de selects: `mt-2` → `mt-1.5`.
- **Verificação final (devtools, 390x844):**
  - Footer total **115px** (era ~200px) com textarea 44px + barra 44px.
  - Espaço abaixo dos selects: 8px; botão enviar oculto quando vazio, visível (40px) ao digitar.

### 4.7 Simetria vertical final (feedback do usuário)

- **Pedido:** o espaço entre os selects e a borda inferior do footer deve ser **igual** ao espaço entre a caixa de chat e a borda superior.
- **Fix:** remover o `pb-2` (8px) → footer `p-3` simétrico (12px top e bottom).
- **Verificação (devtools, 390x844):** espaço acima 13px (12px padding + 1px border) == espaço abaixo 12px; footer **119px**.

### 4.8 Compactação final dos componentes (feedback: "ainda grande")

- **Itens mais pesados:** textarea 44px + triggers dos selects 44px cada (`py-2.5` no mobile).
- **Fix:**
  - textarea vazio: `min-h-11` → `min-h-9` (**36px**).
  - Triggers: `h-9` (**36px**) no `AgentSelect` (`agent-select.tsx`) e `ModelSelect` (`model-select.tsx`).
  - Barra: `mt-1.5` → `mt-1`.
- **Verificação (devtools, 390x844):** footer **101px** (era 200px original); textarea 36px, selects 36px; espaços simétricos (13px/12px); botão enviar só com conteúdo.

### 4.9 Correção final (feedback: "o problema é o espaço vazio abaixo dos selects")

- **Usuário esclareceu:** os selects não eram o problema — o espaço vazio **abaixo** deles é que incomodava. Pediu para voltar os selects ao tamanho original.
- **Fix:**
  - `AgentSelect` / `ModelSelect`: removido `h-9` → triggers de volta a **44px** (original).
  - Footer: `p-3` → `p-3 pb-1` → espaço abaixo dos selects: **4px**.
- **Verificação (devtools, 390x844):** selects 44px, espaço abaixo 4px, textarea vazio 36px, footer **101px**.

### 4.10 ⭐ CAUSA RAIZ REAL do "espaço vazio" (investigação profunda)

- **Sintoma persistente:** o usuário via espaço vazio abaixo dos selects mesmo após todas as reduções de padding interno.
- **Investigação (devtools):** o footer terminava em `y=811` mas o container pai (`_app.tsx:70` — `flex-1 overflow-auto p-4`) terminava em `y=843` — **32px de espaço vazio fora do footer**, entre ele e o bottom do container. Medidas internas (paddings 12px→4px) nunca atacavam esse gap.
- **Causa raiz:** `session/$id.tsx:1148` — `<div className="flex h-full flex-col -m-4">`. O `-m-4` cancela o `p-4` do pai para o conteúdo "vazar" o padding, **mas** `h-full` (100%) resolve contra a content-box do pai (altura **sem** o padding). Resultado: wrapper media `750px` em vez dos `782px` do pai → 32px de folga no bottom.
- **Fix:** `h-full` → `h-[calc(100%+2rem)]` (2rem = 32px = os dois paddings de 16px). Wrapper passa a medir 782px = pai, footer colado em `y=843`.
- **Verificação final:** footer bottom `843` == wrapper bottom `843`; gap para o viewport `1px`; textarea 44px, selects 44px, espaço abaixo dos selects 4px, footer 109px.
- **Aprendizado:** ao compensar padding com margem negativa em layout de altura total, `height: 100%` precisa somar o padding compensado — senão sobra espaço no bottom.

### 4.11 Ajuste de layout dos selects (feedback do usuário)

- **Pedido:** agent mais à esquerda; espaço ganho usado para alargar o select de modelo horizontalmente.
- **Fix:**
  - Barra de selects: removido `justify-end` → `flex items-center gap-2` (agent no início/esquerda).
  - `ModelSelect`: `className="w-auto"` → `min-w-0 flex-1`; trigger `w-52` → `w-full` (cresce até a borda direita).
  - `AgentSelect`: mantém `w-28` (112px) à esquerda.
- **Verificação (devtools, 390x844):** agent left=13px (112px), model 208→**244px** (right=377), espaços laterais simétricos 12px.

## 5. Mensagens QUEUED — enfileirar enquanto o agente trabalha

### 5.1 Problema (feedback do usuário)

- Enquanto o agente trabalha/pensa, o botão de enviar da textarea ficava **girando (Loader)** e **desabilitado** — impossível enviar/enfileirar.
- Mensagens enfileiradas não mostravam a label `Queued`.

### 5.2 Causa raiz

- `handleSubmit` bloqueava com `sending ||` — nada era enviado quando o agente estava ocupado.
- `isQueued: sending` na mensagem otimista era sempre `false` (o submit nunca passava com `sending`).
- A label `Queued` (`$id.tsx`) só renderiza com `message.isQueued` = `metadata.portalQueued`, que nunca era setado.
- Refetch (polling 1.5s) substituía as otimistas queued por mensagens reais do servidor (sem metadata local) — a label sumiria mesmo se fosse setada.

### 5.3 Fix

1. **`$id.tsx`:**
   - `handleSubmit`/Enter: removido `sending ||` do bloqueio (mantém só `submitLockRef`).
   - `const wasSending = sending` capturado antes do reset; `isQueued: wasSending` na otimista.
   - Botão de enviar: `isDisabled={!input.trim() || isSubmitting}`; ícone **spinner só em `isSubmitting`**; `ListPlusIcon` quando `sending` (agente ocupado → vai pra fila); `SendIcon` normal.
2. **`lucide.tsx`:** novo `ListPlusIcon` (import `ListPlus` do lucide-react).
3. **`use-session-messages.ts`:** registro `queuedTexts` (Map key→Set de textos) que sobrevive a refetches:
   - `markMessageQueued`/`clearMessageQueued`/`reapplyQueuedMetadata`.
   - `fetcher` reaplica `portalQueued` após refetch.
   - `addOptimisticMessage`: marca se `isQueued`.
   - `reconcileOptimisticMessage`: preserva `portalQueued` da otimista na mensagem real.
   - `settleOptimisticMessage`: limpa registro.
4. **`use-opencode-events.ts`:** `upsertPromptedMessage` (novo) — quando `session.next.prompted` chega (backend começou a processar), remove `portalQueued` + limpa registro.

### 5.4 Estados do botão de enviar

| Estado                         | Ícone            |
| ------------------------------ | ---------------- |
| Ocioso                         | SendIcon         |
| Agente ocupado (`sending`)     | ListPlusIcon     |
| Enviando HTTP (`isSubmitting`) | Loader (spinner) |

## 6. Perf: reatividade em tempo real (sessões grandes)

### 6.1 Problema (feedback do usuário)

- Reatividade caiu muito ao acompanhar a sessão grande (mDNS, **2.7MB**, 627 mensagens / 2193 partes).
- Causa: `message.part.delta` (SSE) → `revalidateMessagesSoon` (debounce 300ms) → **refetch completo do GET /messages** (2.7MB) + `sortSessionMessages` + re-render de 627 mensagens — ~4 refetches/s durante streaming, mais o polling de 1500ms.

### 6.2 Evidências empíricas

- SSE via portal e backend: deltas a cada **1-2ms** (transporte saudável).
- GET /messages da sessão grande: **81ms**, 2.7MB; sessões normais: 8-12ms.
- 30 fetches sequenciais: média 33ms, **pico 784ms**.
- 14 conexões SSE ativas; `applyEvent` processa eventos de todas as sessões.

### 6.3 Fix

1. **`use-opencode-events.ts`:** `message.part.delta` agora **aplica o delta direto no cache SWR** (`applyPartDelta` — concatena o texto na parte certa, `field === "text"`), sem refetch. Se a mensagem ainda não está no cache (primeiro delta), agenda um refetch de segurança (`schedulePartDeltaFallback`, 2.5s).
2. **`use-session-messages.ts`:** `legacyAssistantContent` agora preserva o `id` da parte text (necessário para o `applyPartDelta` casar o `partID`); `assistantParts` usa `item.id` quando existe.
3. **`session/$id.tsx`:** intervalo do polling de fallback **aumentado** de 1500ms → 10000ms (frequência de refetch reduzida ~6.7x; o SSE cobre o streaming; o polling vira só rede de segurança).

### 6.4 Verificação empírica pós-fix

- Sessão grande aberta + subagent explore rodando em paralelo: **apenas 2 GET /messages** (inicial + um eventual), resto são `session/status` leves. Antes: ~4 refetches de 2.7MB por segundo durante streaming.

### 6.5 Segundo gargalo: reconversão legacy a cada delta

- **Problema:** mesmo com o delta aplicado direto no cache, `sessionMessagesToLegacy` reconvertia **todas** as mensagens a cada mudança de `data` (cada delta criava novo array) — 726 msgs na sessão grande → todos os `MessageItem` re-renderizavam a cada ~1-2ms de streaming.
- **Fix:** cache `legacyConversionCache` (Map por key de sessão, indexado por `message.id`), que reusa o objeto legacy convertido quando a **referência** do `SessionMessage` não mudou. `applyPartDelta`/`updateActiveAssistant` substituem só a mensagem alterada, preservando as demais referências → só a mensagem com delta é reconvertida por frame.
- **Verificado no bundle deployado:** padrão `.get(e.id)` + `source===` presente.

## 7. Sidebar de sessões: ações por long-press (excluir / renomear / mover)

### 7.1 Objetivo

- Remover o comando `/rename` do popover de slash commands.
- Na lista lateral de sessões, **segurar (long-press) numa sessão** abre um menu contextual com: **Excluir**, **Renomear**, **Mover**.

### 7.2 Backend disponível (validado)

- `DELETE /session/:id` — excluir (route `index.delete.ts` já existe no portal).
- Renomear — não há route no portal; o SDK expõe? validar (session.update).
- Mover — mover entre diretórios? validar disponibilidade do SDK.

### 7.3 UI

- `app-sidebar.tsx` (ou componente da lista de sessões): detectar long-press (pointerdown + timer ~500ms) → abrir menu contextual com as 3 ações.
- Menu: reutilizar componente de menu existente (menu.tsx) ou popover simples.

### 7.4 Validação pendente (explore)

- Onde a lista de sessões é renderizada (sidebar).
- Componente de menu contextual disponível.
- SDK: session.update (rename), mover (se existir).

### 7.5 Teste

- Long-press numa sessão → menu aparece com 3 ações.
- Excluir → DELETE funciona; Renomear → atualiza título; Mover → (se aplicável).

### 7.6 Validação do backend (explore + testes reais)

- **DELETE** `DELETE /session/:id` — route existe (`index.delete.ts`).
- **Renomear** — SDK `session.update({sessionID, title})` (PATCH); falta route no portal.
- **Mover** — `POST /experimental/control-plane/move-session` com `{sessionID, destination: {directory}, moveChanges}`. Validado no backend 1.18.16: funciona, mas **só move para diretórios do MESMO projeto git** (senão: "Destination directory belongs to another project").
- `/move` da TUI = "Move to another project dir" (session.move) — mesma API.

### 7.7 Plano de implementação

1. Remover `/rename` do `BUILTIN_COMMANDS` (use-commands.ts).
2. **Renomear**: route `index.patch.ts` (PATCH `/session/:id` → `session.update({sessionID, title})`) + hook `useUpdateSession` + Dialog com TextField.
3. **Mover**: route `move.ts` (POST `/session/:id/move` → chamada HTTP ao backend `/experimental/control-plane/move-session`) + hook `useMoveSession` + Dialog com input de diretório (mostra aviso de mesma-projeto).
4. **Long-press na sidebar** (`app-sidebar.tsx`): detectar pointerdown + timer (~500ms) na `SidebarItem` → abrir `Menu` com Excluir / Renomear / Mover.
5. Manter o kebab existente (Delete) e estender com as mesmas ações.
6. Teste: long-press → menu; excluir/renomear/mover funcionam.

## 8. SPEC — Fix: menu de ações da sidebar (Rename/Move/Delete) no mobile

### Problema (observado em devtools, viewport mobile 390x844, touch)
1. **Menu não abria / clicava navegava**: o gatilho era `<button>` nativo dentro do `SidebarItem` (Link react-aria). O press do Link capturava o gesto e navegava para a sessão.
   - **Fix aplicado**: gatilho virou `Button` do projeto (`react-aria-components`), com `onPress={(e) => { e.preventDefault(); e.stopPropagation(); onOpenChange(!isOpen); }}`. O botão interno reivindica o press e o Link não navega. **Validado**: clique real → `url` permanece `/` e o menu abre.
2. **Menu fora da tela (left: -230 em viewport 390)**: o menu usa `position: fixed` com `top`/`right` calculados via `getBoundingClientRect()`. O `right` inline calculado era `350px` (correto), mas o rect real era `right: -54` → o menu foi posicionado **relativo ao sheet da sidebar mobile** (dialog com `transform`/animação), que vira o *containing block* do `fixed`. O overlay `fixed inset-0` também ficava limitado ao sheet (não cobria a tela).
   - **Fix proposto**: renderizar overlay + menu via `createPortal(..., document.body)` → o `fixed` resolve contra a viewport real, independente de transforms ancestrais.

### Decisões de design
- Portar APENAS o overlay e o card do menu (os `ModalOverlay` dos dialogs já usam react-aria, que faz portal internamente).
- Manter posicionamento right-aligned (`right: innerWidth - trigger.right + 8`), com clamp ≥ 8px.
- Calcular `top`/`right` no momento do render via `triggerRef.current?.getBoundingClientRect()`. Como o portal monta junto do `isOpen`, o ref já está setado (o botão existe na sidebar).
- Recálculo em resize/scroll não é necessário para esta versão (menu efêmero; overlay fecha no mousedown/touchstart).

### Arquivos afetados
- `apps/web/src/components/session-actions-menu.tsx` — portal + gatilho Button (já feito).

### Critérios de aceite (E2E, viewport mobile 390x844 touch)
1. Abrir sidebar → clicar ⋯ → menu aparece **dentro do viewport** (left ≥ 0, right ≤ 390) sem navegar.
2. Overlay cobre a tela toda (fecha no toque fora).
3. Clicar Rename → dialog com input preenchido com o título; Rename → toast "Session renamed".
4. Clicar Move → dialog; Move → toast ou erro amigável (mesma-projeto).
5. Clicar Delete → confirm dialog → sessão removida da lista.
6. Desktop (≥1024): kebab abre menu à direita do item sem quebrar layout.

### Validação do explore (achados) e correções aplicadas
1. `PressEvent` do react-aria 3.48 não declara `preventDefault`/`stopPropagation` nos tipos (TS2339; runtime aceita, mas tsc falha) → **removidas as chamadas** (o react-aria já para a propagação por padrão; o press do kebab nunca vaza para o Link). tsc limpo para os arquivos da mudança.
2. `onLongPress` não existe nos tipos (TS2322) → **long-press reimplementado** com `onPointerDownCapture`/`onPointerUpCapture`/`onPointerCancelCapture` num wrapper `<div>` no map da sessão + timer 450ms + guard de click (previne navegação fantasma no touchend pós-long-press). `onContextMenu` mantido (desktop + Android).
3. Guarda `onPress` no SidebarItem era código morto + TS2339 → **removida**.
4. Touch dismiss via overlay pode navegar para a sessão sob o dedo (click compat pós-touchstart) → `suppressNextClick()` (guard capture de 600ms) chamado no `onTouchStart` do overlay.
5. Kebab auto-placed na linha 2 à esquerda do grid → **posicionado como o SidebarMenuTrigger**: `absolute right-0 top-0 z-10 h-full items-center justify-end pr-2.5` (o Link do SidebarItem é `relative`).
6. Sem fechar no scroll (SidebarContent overflow-auto) → listener `scroll` capture fecha o menu quando aberto.
7. Portal `createPortal(document.body)` mantido (fix do containing block do sheet).
8. `onPointerLeaveCapture` não existe nos tipos do React 19 → removido (sem efeito no touch).

### Resultado E2E (Round 4, bundle final index-B8j5NEFm/_app-DIJ8ZA02)
- Mobile 390x844: kebab à direita (l241 r280, sheet 8..296) ✓; click real abre menu sem navegar ✓; card z-[55] dentro do viewport (96..272) ✓; dismiss touch fecha sem navegar ✓; long-press 450ms abre sem navegar ✓; dialog Rename com input ✓ (Round 3).
- Desktop 1280: kebab à direita do item (328..368) ✓; card dentro (184..360) ✓; click fora (mousedown real) fecha ✓; scroll fecha ✓ (Round 3).
- Loop completo: explore validou → ajustes (PressEvent sem preventDefault, long-press via pointerdown capture, kebab absolute, col-span-full no wrapper, guard de click, close on scroll, portal) → general E2E 3 rounds (rounds 1-2 invalidados por servidor servindo build antigo) → Round 4 PASS.

### Lição de deploy (IMPORTANTE)
O openportal roda o nitro de `~/.bun/install/global/node_modules/openportal/web/server/` (NÃO da raiz). Deploy correto:
1. `bun run build` em `apps/web`
2. `cp -r .output/server/. web/server/` e `cp -r .output/public/assets/* web/public/assets/`
3. `~/.local/bin/portal-auth-patch.sh` (os arquivos patcheados são sobrescritos)
4. **Reiniciar** o processo (kill + `bunx openportal`; via term-cli se o shell matar no timeout)
5. Browser: reload com ignoreCache (assets imutáveis ficam em cache)

### Round 2 (relato do usuário no celular real) — bugs + fixes
Usuário no celular: (a) botão Delete não aparecia; (b) não conseguia tocar em Rename/Move/Delete.

**Diagnóstico reproduzido no devtools (mobile 390x844):**
- Com o kebab no fim da lista (top 692-756), o card abria em top 760, bottom 887 (> 844): **Rename parcialmente fora, Delete totalmente fora** (top 846). Explica (a) e (b) — o card estourava o viewport vertical e nada era tocável.

**Fixes aplicados:**
1. **Clamp vertical do card**: `useLayoutEffect` mede a altura real do card; se `trigger.bottom + 4 + cardH > innerHeight - 8`, abre **acima** do trigger (`trigger.top - cardH - 4`, clamp ≥ 8). Posição (top/right) guardada em state.
2. **Kebab escondido** (pedido do usuário: "retire aqueles '...'"): `opacity-0` por padrão, visível em `pressed`, `group-hover/sidebar-item`, `group-focus-visible` e `group-pressed` (mesmas classes do SidebarMenuTrigger original). No mobile o acesso é via **long-press** (que abre o menu).
3. `touch-manipulation` no card (remove delay/double-tap-zoom em mobile).
4. Fix extra: `inputRef` com `useRef<HTMLInputElement>(null!)` (TS limpo nos arquivos da mudança).

### Critérios de aceite (Round 2)
1. Card SEMPRE dentro do viewport vertical (kebab no topo E no fim da lista).
2. Delete visível e tocável mesmo com o kebab no fim da lista.
3. Kebab invisível por padrão; visível no hover (desktop) e durante press.
4. Long-press continua abrindo o menu sem navegar (mobile).

### Round 2b — reprodução do relato do usuário e guard de pointerup
Relato (celular real, build anterior): long-press abria o popover com Rename/Move, Delete com espaço em branco, e tocar nas opções "atravessava" para a sessão atrás.

**Causas e correções adicionais:**
1. **Delete em branco / card estourado** — já corrigido pelo clamp vertical (Round 2a).
2. **Toque "atravessando"** — o guard de long-press só bloqueava o `click` nativo, mas o `Link` do react-aria completa o press no `pointerup`: soltar o dedo após o long-press navegava (reproduzido: pointerdown/up no item → href mudava). **Fix**: `installReleaseGuards()` (`src/lib/long-press.ts`) registra guards de `pointerup` E `click` em CAPTURE no document (one-shot, 600ms), chamado no fire do timer e no `onContextMenu` (app-sidebar + empty-state). Validado com instrumentação: `item:pointerup` não dispara (guard engole), href permanece `/`, menu abre.
3. Empty-state (tela principal mobile) alinhado: usa `SessionActionsMenu` + long-press (antes: kebab antigo com "Delete Session" sem confirmação).
4. `suppressNavRef` removido (morto); indentação corrigida.

**Validação (devtools, teste limpo com instrumentação completa de eventos):** pointerdown (item) → fire 450ms → menu abre → pointerup → NÃO navega (guard captura no document antes do item). E2E Round 6 (general): 11/11 PASS incluindo click real nos itens do menu (dialogs abrem), clamp no fim das duas listas, kebab inerte/oculto, hover desktop.

### Round 3 — REFATORAÇÃO: delegar ao react-aria (simplicidade)
O código acumulou 3 camadas de mitigação manual (timers de long-press + guards de navegação + portal/clamp do card). Refatorado para delegar ao react-aria:

**O que mudou:**
1. `session-actions-menu.tsx` (~353 → ~250 linhas): o card custom (createPortal + useLayoutEffect/clamp + suppressNextClick + overlay + buttons) foi SUBSTITUÍDO por `Menu` controlado do react-aria (`MenuTrigger` + `MenuContent` popover "bottom end") com 3 `MenuItem` (Rename/Move/Delete) + separator. Flip automático do Popover resolve o Delete cortado; dismiss automático (press fora/scroll/Escape) resolve o atravessar; sem portal manual. Dialogs (ModalOverlay) mantidos.
2. `app-sidebar.tsx`: removidos wrapper div, longPressTimer, onPointer*Capture e guards → `SidebarItem` direto com `onContextMenu` (preventDefault + abrir menu). Long-press nativo do browser dispara contextmenu em links (Android/iOS) sem click fantasma.
3. `empty-state.tsx`: idem (li com onContextMenu).
4. `lib/long-press.ts`: DELETADO.

**Resultado E2E (Round 7, general): 8/8 PASS** — contexto abre menu sem navegar (href "/"), menu dentro do viewport, flip no fim da lista (Delete visível), toque real em Rename/Move/Delete abre dialogs, dismiss sem navegar, kebab inerte no mobile (opacity 0 / pointer-events none) e hover-visível no desktop.

### Round 4 — dialog aberto desativa os itens de sessão (fix do toque longo no input)
**Relato do usuário**: ao renomear no celular, o toque longo no input não mostrava o menu nativo do Android (selecionar tudo/copiar/colar) — "como se estivesse pressionando uma outra sessão por trás".

**Fix (abordagem do usuário — itens inertes com dialog aberto):**
1. `SessionActionsMenu` ganhou `onDialogOpenChange` — notifica o pai quando rename/move/delete abre/fecha; `onAction` de cada MenuItem chama `onOpenChange(false)` explicitamente (garante menu fechado antes do dialog).
2. `app-sidebar` e `empty-state`: estado `dialogOpen`; `onContextMenu` dos itens retorna **antes** do `preventDefault` quando `dialogOpen` — o toque longo no input do dialog não abre o menu de sessão nem suprime o menu nativo de texto.

**Validação (devtools):** menu abre por long-press ✓; dialog abre e menu fecha (`role="menu"` ausente) ✓; com dialog aberto, contextmenu no input → `defaultPrevented: false` + nenhum menu de sessão + dialog permanece ✓; long-press volta a funcionar após Cancel ✓.

### Round 5 — popover de comandos re-posiciona com o teclado virtual
**Relato**: ao digitar "/" do zero (sem foco), o popover nascia numa posição/espaçamento errado no celular; ao digitar "x" (re-render), ele recalcularia e ficava correto — queria que já nascesse correto.

**Causa**: CommandPopover calculava a posição uma única vez no render com `window.innerHeight`. No mobile, ao digitar "/", o popover montava enquanto o teclado ainda abria/reposicionava o textarea → posição errada e TRAVADA até o próximo input.

**Fix** (`command-popover.tsx` + `file-mention-popover.tsx`):
1. Posição movida para `useState` + `useLayoutEffect` com `compute()` (bottom = innerHeight - textareaRect.top + 10, clamps iguais).
2. Listeners de re-cálculo: `window resize`, `visualViewport resize`/`scroll` (o teclado abre/fecha), `document scroll` (capture) — o popover re-posiciona sempre que o layout muda.
3. FileMentionPopover (desktop fixed): mesmo tratamento no effect de coords (mobile já usa absolute bottom-full e segue o composer).

**Validação (devtools)**: com o popover aberto, mudança de viewport (390x600 simulando teclado) → popover re-posicionou automaticamente (top 499→255), mantendo gap de 10px acima do textarea. tsc limpo (3 pré-existentes nos hooks).

### Round 6 — Envio de arquivos do celular (FilePart via data URL)
**Viabilidade confirmada** (source opencode `session/prompt.ts`): `/prompt` aceita `parts` com `FilePartInput {type:"file", mime, filename?, url}`; o `url` aceita `data:` URL (texto é decodificado e injetado; imagens viram anexo e são normalizadas via `image.normalize`). Boas práticas do MDN: `FileReader.readAsDataURL`, `accept`, validação de tamanho.

**Implementação:**
1. `server/opencode/[port]/session/[id]/prompt.ts`: schema com `parts?` (array FilePartInput) e `text` opcional; `promptInput` = `[...parts, ...(text ? [textPart] : [])]`; 400 se vazio.
2. `routes/_app/session/$id.tsx` (composer):
   - `Attachment` state + `handleAttachFiles` (valida tamanho ≤8MB e mime: `image/*,application/pdf,text/plain,text/markdown,text/csv,application/json`; `FileReader.readAsDataURL`).
   - Botão "Attach files" (Paperclip) + `<input type="file" multiple hidden accept=...>`.
   - Chips dos anexos (nome + tamanho + remover) acima do textarea.
   - `handleSubmit`: aceita texto OU anexos; otimista com file parts; limpa anexos após envio.
   - `sendMessage`: envia `parts` (file) + `text` no body do `/prompt`.

**Validação (E2E devtools):** upload de `anexo-teste.txt` → chip aparece → enviar → resposta do modelo: "Called the Read tool with the following input: {"filePath":"anexo-teste.txt"}" + conteúdo do arquivo + texto da mensagem. **Fluxo completo funciona.** tsc limpo (3 pré-existentes).

## 9. Composer estilo ChatGPT (redesenho completo do footer de input)

### 9.1 Objetivo (feedback do usuário)

Replicar o composer do ChatGPT web: texto em **linha única entre os botões** (clipe e enviar), texto de **2+ linhas no wrapper** (acima dos botões), rolagem interna que **nunca deixa o texto alcançar os botões**, quebra de linha (explícita E automática) ativando o modo wrapper, e botão de enviar alinhado.

### 9.2 Arquitetura final (espelhada do ChatGPT real — hierarquia medida no site)

- **Caixa** (era `relative`): `relative rounded-lg border border-input bg-background transition-colors hover:border-muted-fg/30 focus-within:border-ring/70 focus-within:ring-3 focus-within:ring-ring/20` — borda/ring/hover passam para a caixa.
- **Wrapper de scroll** (filho da caixa): `max-h-60 overflow-y-auto scroll-pb-2` + **`pb-12` condicional** (só quando `wrapped` — a reserva do scroll vive no wrapper, não no texto).
- **Textarea** (dentro do wrapper, `border-0! rounded-none! bg-transparent! focus:ring-0!`): cresce livre via `field-sizing-content`; classes condicionais:
  - modo 1 linha: `min-h-11 pt-3 pb-1 pl-11! pr-13!` — texto entre os botões (começa após o clipe, termina antes do enviar);
  - modo wrapper (2+ linhas): `min-h-12 py-2` — padding simétrico do componente (13px/13px mobile, 11px/11px desktop).
- **Botões**: absolute na base da caixa — clipe `left-1 bottom-1 z-10` (button nativo discreto, sem fundo), enviar `right-2 bottom-1`.
- **`measureRef`**: textarea invisível/absolute de medição de quebra de linha.

### 9.3 Comportamentos (validados devtools 390x844 e 1280x800)

- **1 linha:** campo compacto (44–52px); texto na **mesma faixa vertical dos botões** ("de um botão até o outro"); campo vazio ~90px total.
- **Quebra (Enter OU wrap automático):** o texto "sobe" para o wrapper; última linha ~8–16px acima dos botões (o espaço liberado é usado pelo texto — sem vão).
- **Muitas linhas:** wrapper rola em **240px** (`max-h-60`); fim do texto no scroll máximo fica **8px+ acima do enviar** (a reserva `pb-12` do wrapper garante — o texto nunca alcança os botões em nenhum scroll/caret).
- **Botões:** sempre visíveis na base; enviar centralizado verticalmente no modo 1 linha.

### 9.4 Bugs encontrados e correções

1. **`field-sizing: content` alarga o textarea** por palavra longa sem quebra → `min-w-0` no textarea (e `minmax(0,1fr)` na fase grid).
2. **Cascade**: `sm:px/py` do componente vencem `pl-0/pb-14` do chamador em viewport ≥640px → classes do chamador com **`!important`**.
3. **Auto-scroll do caret** rola o texto sobre os botões (e scroll-padding é ignorado pelo caret-scroll de textarea) → solução **estrutural**: scroll no wrapper separado da faixa dos botões (arquitetura do ChatGPT; handler JS descartado).
4. **Vão de ~40px** entre texto e botões (2–3 linhas) com `pb-14!` no textarea → reserva movida para o wrapper, condicional `wrapped` (`pb-12` só com 2+ linhas) — o texto desce e usa o espaço liberado.
5. **Oscilação de modo entre ~66–100 chars**: a largura útil do texto muda entre os modos (268px no 1-linha vs 338px no wrapper), então a medição no textarea real alternava a cada tecla → medição num **textarea oculto** (`measureRef`) com largura fixa do modo 1 linha (`wrapper.clientWidth − 96px`, que é `pl-11`+`pr-13`), font/line-height iguais ao real. Resultado: **1 única transição** em cada direção.
6. **`min-h-16` do componente** (64px) fazia a medição ler 2 linhas para um texto de 1 linha (campo preso no wrapper) → `min-h-12` (48px) no modo wrapper.
7. **Botão enviar 6px acima do centro** no modo 1 linha (`bottom-2` + altura 40px vs clipe `bottom-1` 36px) → `bottom-1` (centro 766 vs caixa 768, 2px residuais).

### 9.5 Detecção de quebra de linha (estável)

- Estado `wrapped` + `useEffect` dependente de `input` que mede `scrollHeight`/`lineHeight` no textarea oculto — cobre **Enter, wrap automático e setInput programáticos** (slash/mention/clear/envio).
- `wrapped` controla: `pb-12` do wrapper, `pl/pr` e altura do textarea, e o layout do botão enviar.

### 9.6 Verificação final (devtools, mobile 390x844)

- Digitação contínua 0→122 chars: **1 transição** (entra no wrapper no char ~36), permanece até o fim — zero oscilação.
- Apagar 122→0: **1 transição** (volta ao modo 1 linha no char ~35).
- Scroll no wrapper (15 linhas): fim do texto 734 vs enviar 742 (folga 8px) / clipe 750 (folga 16px).
- Simetria do wrapper: 13px/13px (mobile), 11px/11px (desktop); modo 1 linha: pl-44px/pr-52px.
- Enviar centralizado: centro 766 vs caixa 768 (2px).

### 9.7 Arquivos

- `apps/web/src/routes/_app/session/$id.tsx` — composer, estados `wrapped`/`measureRef`, useEffect de medição, classes condicionais.
- `apps/web/src/components/ui/textarea.tsx` — componente base (inalterado; chamador usa `!important`).

## 10. Fix: `/undo` não funcionava (e `/redo`, `/compact` quebrados)

### 10.1 Sintoma

- Digitar `/undo` no composer retornava "sucesso" (nenhum erro na UI) mas **nada acontecia** — as mensagens continuavam visíveis e o histórico não era revertido.

### 10.2 Causa raiz

1. **Payload errado na API**: `apps/web/src/server/opencode/[port]/session/[id]/builtin.ts` chamava `client.session.revert({ sessionID: id })` **sem `messageID`** — o servidor opencode (v1.18.16) exige `messageID` no body e responde `400 Missing key ["messageID"]`.
2. **Erro engolido**: o SDK (`@opencode-ai/sdk`) retorna `{ error }` em vez de lançar (default `ThrowOnError: false`) → o handler não verificava `result.error` → devolvia `{ accepted: true }` mesmo com 400.
3. Mesma falha em `/compact` (`summarize` exige `providerID` + `modelID`) e em `/redo` (sem lógica de desfazer a reversão parcial).
4. Frontend não consumia o campo `revert` da sessão → mensagens revertidas continuavam renderizadas.

### 10.3 Fix

**Backend (`builtin.ts`)**:
- `/undo`: busca a sessão + mensagens, pega a **última mensagem de usuário** anterior ao ponto de revert (`session.revert.messageID`), chama `revert({ sessionID, messageID })` com o ID real; aborta a sessão se estiver busy; `400 "Nothing to undo"` quando não há o que desfazer.
- `/redo`: se há um ponto de revert e existem mensagens de usuário depois dele, reverte até a próxima; senão chama `unrevert` (restaura tudo) — espelha a lógica do CLI.
- `/compact`: passa `providerID`/`modelID` do `session.model`.
- **Todos os casos** checam `result.error` e lançam `HTTPError` com a mensagem do servidor.

**Frontend (`$id.tsx`)**:
- Extrai `currentSession.revert.messageID` (campo `revert` já vem no `GET /sessions`).
- Filtra do histórico as mensagens com `id >= revert.messageID` (mesmo critério do CLI).
- Banner no fim da conversa: "N messages reverted" + botão `/redo to restore` (chama `runBuiltinAction("redo")`).
- Novo helper `runBuiltinAction(action)` reutilizado pelo path de comandos builtin do `handleSubmit` (antes inline).

### 10.4 Verificação (API end-to-end)

- `/undo` em sessão com user+assistant: `200` + `session.revert.messageID` preenchido.
- `/redo`: `200` + `revert` volta a `null`.
- `/undo` sem nada a desfazer: `400 {"message":"Nothing to undo"}` (antes: 200 falso).
- `/compact`: `200` (antes: 400 `Missing key ["providerID"]` engolido).
- tsc: só os 3 erros pré-existentes.

### 10.5 Arquivos

- `apps/web/src/server/opencode/[port]/session/[id]/builtin.ts` — payload correto + checagem de erros do SDK.
- `apps/web/src/routes/_app/session/$id.tsx` — filtro de revertidas, banner `/redo`, `runBuiltinAction`.

## 11. Undo por mensagem: seta em cada user message + `/undo` fora do popover

### 11.1 Motivação

- Mesmo tratamento já dado ao `/redo` na seção anterior: o usuário quer **undo por mensagem** — seta em cada mensagem de usuário que reverte a conversa até aquela mensagem — e quer que `/undo` (assim como `/redo`) **saia do popover de slash commands** e do reconhecimento por digitação manual (só as setas disparam a ação).

### 11.2 Mudanças

**Backend (`builtin.ts`)**:
- Schema aceita `messageID` opcional no body (`z.string().optional()`).
- Case `undo` com `body.messageID` chama `revert({ sessionID, messageID })` **diretamente** com o ID alvo; sem `messageID` mantém a lógica antiga (última user message).

**Frontend (`$id.tsx`)**:
- `runBuiltinAction(action, messageID?)` — segundo parâmetro opcional enviado no body.
- `MessageItem` recebe props `onUndo(messageID)` e `isOptimistic`.
- Seta `Undo2Icon` (aria-label "Undo to this message") na base de cada mensagem de usuário, **escondida** quando `isQueued` (otimista/enviando) ou `isOptimistic`.
- `optimisticMessageIDs`: ids de mensagens de usuário marcadas com `metadata.portalOptimistic` (mensagens ainda não confirmadas pelo backend) — seta fica oculta nelas.
- Array `isBuiltinCommand` (digitação manual de `/cmd`) **sem** `undo`/`redo` — só `compact`, `share`, `unshare`, `fork` disparam.

**`use-commands.ts`**:
- `BUILTIN_COMMANDS` sem `undo` e sem `redo` (o popover já não mostra nenhum dos dois).

### 11.3 Verificação (API end-to-end)

- `POST /builtin { action: "undo", messageID: <id de user msg> }` → `200` e `session.revert.messageID` = o id alvo (reverte o histórico até aquela mensagem).
- `/redo` → avança o ponto de revert; `unrevert` → `revert: null` (estado restaurado).
- Bundles deployados contêm: aria-label "Undo to this message" + wiring `onUndo` no chunk `_id`; ícone `Undo2` no chunk lucide; `messageID` no `builtin.mjs`.
- tsc: só os 3 erros pré-existentes (não introduzidos).

### 11.4 Nota — teste na sessão ativa

- O teste end-to-end foi feito numa sessão **ativa** do opencode no próprio diretório do repo; o `/undo` com `messageID` revertou também o working tree (snapshots da sessão). Sessão restaurada com `unrevert`. Working tree reconciliado contra o build deployado.

### 11.5 Arquivos

- `apps/web/src/server/opencode/[port]/session/[id]/builtin.ts` — `messageID` opcional no `undo`.
- `apps/web/src/routes/_app/session/$id.tsx` — seta `Undo2Icon`, `onUndo`, `optimisticMessageIDs`, `isBuiltinCommand` sem undo/redo.
- `apps/web/src/hooks/use-commands.ts` — `BUILTIN_COMMANDS` sem undo/redo.
- `apps/web/src/components/icons/lucide.tsx` — `Undo2Icon` (`Undo2`).


## 12. Diff sem scroll lateral: linhas quebram (overflow: "wrap")

### 12.1 Motivação

- Na view `/diff`, linhas longas criavam **scroll lateral** no mobile. O comportamento desejado: **quebrar linhas** (wrap), sem scroll horizontal — igual ao upstream/desejo do usuário.

### 12.2 Causa

- O `FileDiff` (`@pierre/diffs/react`) por padrão usa `overflow: "scroll"` (default do pacote), que emite `data-overflow="scroll"` no shadow DOM → `[data-line] { white-space: pre }` + container scrollável (host `CODE` com `scrollWidth > clientWidth`).
- O `main.css` tinha overrides mortos do antigo `react-diff-view` (`.diff-line`, `.diff-gutter`, `.diff-code` com `white-space: pre-wrap; word-break: break-all`, etc.) — o `@pierre/diffs` usa data-attributes + shadow DOM, então eram resíduos inócuos (removidos, sem efeito funcional).
- Nenhum chunk buildado com `overflow:"wrap"` estava ativo; todos os builds serviam o default `"scroll"`.

### 12.3 Fix

- `apps/web/src/routes/_app/diff.tsx`: `options` do `FileDiff` agora inclui `overflow: "wrap"` explícito.
- `apps/web/src/main.css`: removido o bloco inteiro "react-diff-view theme overrides" (morto).

### 12.4 Verificação

- Chunk deployado (`diff-C1WC_zMr.js`) contém `overflow:\`wrap\`` nas options.
- Browser (CDP, viewport 390x844 mobile e 1280x800 desktop): `diffs-container` → `data-overflow="wrap"`, `[data-line]` com `white-space: pre-wrap` e `word-break: break-word`, e `scrollableHosts: []` (nenhum host com `scrollWidth > clientWidth`).
- tsc: só os 3 erros pré-existentes.

### 12.5 Arquivos

- `apps/web/src/routes/_app/diff.tsx` — `overflow: "wrap"` nas options do FileDiff.
- `apps/web/src/main.css` — removidos overrides do react-diff-view.

## 13. Tool call "em cascata" colada ao texto do modelo

### 13.1 Relato (feedback do usuário)

- Sempre que o modelo respondia com texto e em seguida usava uma tool, a primeira tool aparecia **"em cascata"** logo abaixo do texto, como se fizesse parte da mensagem de texto.

### 13.2 Causa raiz

- No formato v2 do OpenCode, cada "step" do modelo vira **uma única mensagem assistant** com `content: [step-start, reasoning, text, tool, step-finish]` — texto e tool na mesma mensagem (confirmado em dados live: `ses_fffc5916...`, msgs como `H8t6E0Nd6ARE` com `['step-start','reasoning','text','tool','step-finish']`).
- `MessageItem` (`routes/_app/session/$id.tsx`) renderizava texto e, no mesmo bloco, as tools como **linhas mono simples indentadas com `ml-6`** — sem borda/fundo, pareciam continuação do parágrafo.
- Inconsistência: o box de `question` e o `PermissionRequestForm` já eram cards com borda; só a tool comum era linha "crua".

### 13.3 Fix

- `ToolCallItem`: linha simples → **chip/card** `rounded-md border px-2.5 py-1 font-mono text-xs`, com cor por estado seguindo o padrão dos cards existentes:
  - completed → `border-border bg-muted/25 text-muted-fg`
  - pending/running → `border-warning/40 bg-warning/10 text-warning` (+ `...` pulse mantido)
  - error → `border-danger/40 bg-danger-subtle/30 text-danger`
- `MessageItem`: removido o `ml-6` das blocks de tools e permissões → `mt-3 space-y-1` / `mt-3 space-y-2` sem indentação.

### 13.4 Fix 2 — tool dentro do delimitador tracejado da mensagem (feedback do usuário)

- O chip parou de "cascatear", mas a primeira tool ainda ficava **dentro do bloco tracejado** da mensagem de texto (o container da lista usa `divide-y divide-dashed`, e o `MessageItem` era um único filho `py-3 px-6` com texto+tools juntos).
- Fix: `MessageItem` virou **fragment com até 3 rows irmãs** (`py-3 px-6` cada): texto / tools (`space-y-1`) / permissões (`space-y-2`). As rows viram filhos diretos do `divide-y` → cada uma ganha delimitador tracejado próprio (no Tailwind v4 o `divide-y` aplica `border-bottom: 1px dashed` em `:not(:last-child)`), idêntico às mensagens só-de-tool.
- `hasVisibleContent` inalterado; nenhuma mudança em hooks/estado.

### 13.5 Verificação

- tsc: só os 3 erros pré-existentes.
- Build deployado: chunk da rota de sessão (`_id-*.js`) contém as classes do chip e **zero** `ml-6`.
- CDP (mobile 390x844 e desktop 1280x800): row do texto com `border-bottom: 1px dashed` e a row da tool (`py-3 px-6`) logo abaixo, também com o próprio `1px dashed` — tool fora do delimitador do texto; screenshot mostra texto e tool em blocos separados.

### 13.6 Arquivos

- `apps/web/src/routes/_app/session/$id.tsx` — `ToolCallItem` como chip card; `MessageItem` split em rows irmãs (texto/tools/permissões).

## 14. Tool expansível estilo TUI (click no card = conteúdo completo)

### 14.1 Motivação (feedback do usuário)

- Queria expandir as tools clicando nelas para ver **todo o conteúdo**; sem scroll interno (a rolagem principal do chat percorre o card); sem JSON cru — tudo **texto contínuo** com a linha de invocação fazendo parte do conteúdo, **como o TUI** do opencode (`~/opencode/packages/tui/src/routes/session/index.tsx`).

### 14.2 Implementação

- `ToolCallItem` vira card expansível: container único com `role="button"`, `tabIndex`, `aria-expanded`, `onClick` + Enter/espaço no `onKeyDown` — **qualquer pixel do card alterna**.
- **Colapsado**: chip com ícone + label truncado + chevron.
- **Expandido**: só o texto contínuo (sem header truncado, sem `border-t`): `<pre>` com a invocação completa como 1ª linha + output + erro; rodapé mudo `Click to collapse` (chevron rotacionado, `select-none` — não copiável).
- `toolExpandedLines(part)` — formatação por tool espelhando o TUI, **sem JSON**:
  - `bash`/shell → `$ <comando completo>`
  - `read` → `Read <path> [offset=…, limit=…]` (args primitivos extras)
  - `grep`/`glob` → `Grep "<pattern>" in <path>` / `Glob "<pattern>" in <path>`
  - `write` → `Write <path>` + `input.content` (o conteúdo escrito por inteiro)
  - `edit` → `Edit <path> [replaceAll=…]` + `metadata.diff` (structured do server)
  - `webfetch` → `WebFetch <url>`; `websearch` → `WebSearch "<query>"`
  - `skill` → `Skill "<name>"`
  - `todowrite` → `Todos` + `[✓]`/`[•]`/`[ ] <content>` por item (parse de `input.todos`; **output JSON do server nunca exibido**)
  - `apply_patch` → `Patch` + por arquivo (`Patched`/`Created`/`Deleted`/`Moved <path>` + patch, de `metadata.files`)
  - `task` → `Task <description>`; `execute` → `execute` + `↳ <tool> [args]` por `metadata.toolCalls`
  - genérico → `<tool> [k=v, …]` (só primitivos, igual `input()` do TUI) + output cru
- Helpers: `formatToolArgs` (primitivos string/number/boolean), `formatToolInvocation`, `toolMetadata` (acesso seguro a `state.metadata` na união), `parseTodoItems`, `parseApplyPatchFiles`, `toolExpandedLines`.

### 14.3 Guards anti-colapso durante cópia/seleção (feedback do usuário)

- `toggleExpanded(event)` **não colapsa** quando:
  - `window.getSelection()?.toString()` não vazio (seleção ativa)
  - `event.detail > 1` (duplo-clique)
  - `hadSelection` no `onPointerDown` (mousedown começou com seleção ativa → clique de **deseleção**; o mousedown limpa a seleção antes do click, então a checagem no click não bastava)
  - pointer moveu > 4px entre `onPointerDown` e o clique (arrasto)
- **Toggle diferido (250ms)**: o clique agenda o toggle num timer; se chegar um 2º clique dentro da janela (duplo-clique), o timer é cancelado e nada alterna — resolve o 1º clique do duplo-clique, que colapsaria antes da seleção de palavra existir. Consequência: duplo-clique em card colapsado não expande (vira gesto de seleção puro). Timer limpo no unmount.
- Teclado (Enter/espaço): cancela timer pendente e alterna **imediatamente** (sem latência).
- Rodapé `Click to collapse` com `select-none` (não copiável; clique segue funcionando no container).

### 14.3.1 Copiar a partir do card colapsado = conteúdo completo (feedback do usuário)

> **Substituído pela §17** — o `onCopy` por card + heurística de rects (abaixo) só funcionava com a seleção inteira dentro do card; seleção que cruzava a borda copiava o label truncado. Agora há um único listener de `copy` no documento (§17) que reescreve a seleção inteira.

- Regra: **copiar de um chip truncado (colapsado) selecionando até a reticência → copia o conteúdo completo** (`toolExpandedLines(part).join("\n")`); seleção parcial (não alcança a reticência) → cópia nativa do selecionado; chip não-truncado → nativo; expandido → nativo.
- `onCopy` no container (`cardRef`), só age com o card **colapsado**: seleção vazia ou com nó comum fora do card → passa; chip sem truncamento → passa; senão:
  - `truncated` = `labelEl.scrollWidth > labelEl.clientWidth + 1` (clip visual) **ou** `label.endsWith("...")` (bash >50 chars)
  - a seleção **alcança a reticência** quando `selRect.left < labelRight` (sobrepõe a borda direita do label — exclui seleção só do details/ícone) **e** `selRect.right >= labelRight - 24` (zona da reticência ~24px) → `preventDefault()` + `clipboardData.setData("text/plain", …)`
- Evolução da detecção (bugs encontrados em sequência):
  1. `selection.toString().includes("...")` — falhava no mobile: o CSS `truncate` clippa o label antes do `"..."` literal do DOM (medido 418px vs 287px visíveis), arrasto real nunca captura o `"..."`
  2. `endsWith("...") || visuallyTruncated` — interceptava **qualquer** seleção de chip truncado (copiava tudo sempre): o `endsWith` é verdadeiro independente do trecho selecionado e o `visuallyTruncated` também
  3. Atual: checagem por **fronteira visual** via rects da seleção vs borda direita do label (acima)
- Cards de `question` inalterados (já exibem tudo inline).

### 14.4 Verificação

- tsc: só os 3 erros pré-existentes.
- Build deployado (`index-*.js` + chunk `_id-*.js` com `Click to collapse`).
- CDP mobile 390x844 e desktop 1280x800 (validação com retries; abas antigas com SSE saturam conexão do Chrome — fechar abas antes):
  - expandir → texto contínuo inicia com a invocação (ex. `$ term-cli start …`, `Read … [offset=…]`, `Todos` + `[✓]/[•]/[ ]`), `overflow-y: visible` (sem scroll interno)
  - duplo-clique (detail=2) → não colapsa; arrasto >4px → não colapsa; seleção ativa + clique → não colapsa; clique de deseleção (pointerdown com seleção) → não colapsa
  - clique limpo (pointerdown+click na mesma posição) → alterna **após ~250ms**; 2º clique na janela cancela (duplo-clique não alterna); Enter → alterna imediato
  - footer: `user-select: none`
  - copiar colapsado: seleção parcial (ex. 15 primeiros chars) → nativo; seleção até a reticência / select-all → conteúdo completo; chip não-truncado → nativo; expandido (trecho) → nativo
  - `todowrite` sem JSON (`Todos` + checkboxes); `write` mostra `input.content`; `skill` mostra `Skill "<name>"`

### 14.5 Arquivos

- `apps/web/src/routes/_app/session/$id.tsx` — `ToolCallItem` expansível estilo TUI, `toolExpandedLines` e helpers, guards anti-cópia, footer `select-none`.

## 16. Composer: scroll só no wrapper — texto nunca invade a área dos botões

### 16.1 Relato (feedback do usuário)

- Muitas quebras de linha no composer: o caret/última linha acabava fora da área visível e o texto passava **por trás dos botões** attach/enviar ("invadindo onde não devia").

### 16.2 Investigação (medições CDP)

- Arquitetura: textarea `field-sizing-content` (cresce, sem scroll interno) dentro de wrapper `max-h-60 overflow-y-auto`; botões são filhos do box externo (`absolute bottom-1`), sobrepostos ao fundo do wrapper.
- O navegador mantém o caret com folga de só 8px (`scroll-pb-2`) da borda inferior → com os botões (~40px) sobrepostos, a linha do caret ficava **sempre atrás dos botões** (medido: caretLine [713,737] vs buttons [706,742] em 10→23 linhas, congelado na mesma posição).
- O `pb-12` do wrapper só protegia com scroll no fim (`scrollTop = scrollHeight`) — o navegador nunca rola até o fim (scroll mínimo para a folga).
- Tentativas descartadas: (a) pin JS no `onInput` (`scrollTop = scrollHeight` quando caret no fim) — funcionava nas medições mas o usuário ainda via falha ao rolar para cima; (b) textarea com `max-h-60 overflow-y-auto` interno + wrapper `overflow-hidden` — piorou (rolagem interna do textarea).

### 16.3 Fix (arquitetura do usuário — simples e robusta)

- **Scroll só no wrapper**, e os **botões ficam FORA da área de scroll**:
  - Wrapper: `` `max-h-60 overflow-y-auto scroll-pb-2 ${wrapped ? "mb-12" : ""}` `` — o `mb-12` (48px) quando wrapped cria uma faixa no box externo onde os botões (absolute `bottom-1`) ficam **abaixo da borda do wrapper** → o texto rolado termina na borda do wrapper e **nunca alcança os botões, por construção**.
  - Removidos `pb-12` e `scroll-pb-12` do wrapper (a faixa `mb-12` substitui); mantido `scroll-pb-2` (folga do caret na borda).
  - Removido o pin do `onInput` (desnecessário — sem sobreposição, não há invasão a corrigir; o scroll natural do browser cuida do caret).
- Modo 1-linha: inalterado (sem scroll, botões ao lado do texto com `pl-11! pr-13!`, sem `mb-12`).

### 16.4 Verificação

- tsc: só os 3 erros pré-existentes. Deploy `index-D9uUpSeG.js`.
- CDP desktop 1280x800 e mobile 390x844 (22 linhas via `insertText`):
  - `taScrollTop: 0` (textarea sem scroll) e `wScrollTop` cresce (scroll só no wrapper)
  - `btnTop (706/746) >= wrapperBottom (698/742)` → **botões fora da área de scroll** em todas as etapas
  - `caretVisible: true` sempre; rolar o wrapper ao topo + digitar no fim → caret volta visível (scroll natural)

### 16.5 Arquivos

- `apps/web/src/routes/_app/session/$id.tsx` — wrapper com `mb-12` quando wrapped; pin removido do `onInput`.

## 17. Copy com tool colapsada: conteúdo completo em qualquer seleção (feedback do usuário)

### 17.1 Relato

- Copiando uma seleção que ia **além da tool colapsada** (começava/percorria texto fora do card), o trecho da tool saía **incompleto — só até o `...`** do label (`bash <cmd>...`), em vez do conteúdo inteiro.

### 17.2 Causa

- O interceptador antigo vivia no `onCopy` **do próprio card** (§14.3.1) e desistia quando `cardRef.contains(range.commonAncestorContainer)` era falso — qualquer seleção que cruzasse a borda do card tinha nó comum no elemento pai → desistia → copia nativa copiava só o label truncado (o `...` é **literal** no label, `bash` >50 chars, §14.2).
- Pior: seleção **começando fora** do card nem disparava o `onCopy` do card (o target do evento `copy` é o nó onde a seleção começa) — o fix precisava morar num ancestral da seleção inteira.

### 17.3 Fix

- Interceptação única em `useEffect` do `SessionPage`: `document.addEventListener("copy", …)` (removido o `onCopy`/`handleCopy` do `ToolCallItem`).
- Cards colapsáveis ganham `data-tool-card`; um `Map<HTMLElement, () => string>` no escopo do módulo (`toolCardLines`) guarda a fábrica `() => toolExpandedLines(part).join("\n")` de cada card montado (registrada em `useEffect` do `ToolCallItem`, limpa no unmount — sem serializar outputs grandes em atributos).
- Handler (bails em ordem):
  1. target do evento em `input, textarea` → nativo (composer não é afetado; seleção de textarea nem aparece em `window.getSelection`)
  2. sem seleção ou `isCollapsed` → nativo
  3. cards registrados com `range.intersectsNode(card)`, `isConnected` e `aria-expanded !== "true"` (colapsados apenas), ordenados por posição no DOM → nenhum → nativo
  4. `range.cloneRange()` (a seleção do usuário **não** é mutada) + `setStartBefore(cards[0])`/`setEndAfter(cards[last])` → o clone sempre contém os cards **inteiros**, mesmo com seleção parcial no meio do label
  5. `cloneContents()` → `querySelectorAll("[data-tool-card]")` → pareia com os cards vivos por ordem (divergência de tamanho → nativo, safety) → substitui cada clone por um `<div>` com as linhas completas
  6. fragmento renderizado num host off-screen (`position:fixed; left:-9999px; visibility:hidden`) → lê `host.innerText` (mesmo algoritmo do copy nativo: quebras de bloco, `pre` preservado) → remove host → `preventDefault()` + `clipboardData.setData("text/plain", text)`
- Resultado: seleção que inclui 1+ tool(s) colapsada(s) — começando dentro, antes ou depois delas — sai com o conteúdo completo no lugar do label truncado, preservando o resto; **vários cards numa seleção** funcionam; cards expandidos e question cards não são tocados.

### 17.4 Verificação

- tsc: só os 3 erros pré-existentes. Build deployado: `index-BYyI1SDK.js` + chunk `_id-CaM7Wo-2.js` (contém `data-tool-card` e `intersectsNode`).
- CDP (mobile 390x844 e desktop 1280x800): seleção cruzando um card `bash …...` → colar confere comando+output completos; seleção só dentro do card → conteúdo completo; seleção antes/atravessando/terminando no card → resto preservado; copy do composer → texto do composer.

### 17.5 Arquivos

- `apps/web/src/routes/_app/session/$id.tsx` — `data-tool-card` no card, `toolCardLines` (Map módulo), listener de `copy` no documento (SessionPage); removidos `handleCopy`/`onCopy` do `ToolCallItem` (§14.3.1 descontinuado).

### 17.6 Correção: 3 bugs no handler + robustez (CDP headless)

- **Bug 1 — clipboard sempre vazio**: o host off-screen usava `visibility:hidden` → o Chrome retorna `""` para `innerText` de conteúdo `visibility:hidden` (medido: 5 variações de CSS; só offscreen sem `visibility:hidden` funciona) → `preventDefault()` + `setData("text/plain", "")` → **nada copiado** em qualquer seleção com tool colapsada. Fix: host com `position:fixed;left:-9999px;top:0;pointer-events:none;white-space:pre;` + `aria-hidden` (o `white-space:pre` também evita soft-wraps espúrios do `innerText` no width do host, que o copy nativo não tem).
- **Bug 2 — bail por target**: `event.target?.closest("input, textarea")` era contraproducente — com o textarea do composer **focado** mas seleção no chat, o target do evento é o textarea → bail → copy nativo copia a seleção vazia do textarea → nada. Fix: remover o bail por target; guard de seleção `!selection || selection.rangeCount === 0 || selection.isCollapsed` → return (preserva o copy do composer: seleção interna de textarea não aparece em `window.getSelection()`, `rangeCount === 0`; também evita `IndexSizeError` do `getRangeAt(0)` com seleção de documento vazia).
- **Bug 3 — bail `clones.length !== cards.length` com card expandido na seleção**: o card expandido era filtrado de `cards` (predicado `aria-expanded`), mas o clone dele (root com `data-tool-card`) fica no fragmento → mismatch → bail → copy truncado. Fix: aplicar o **mesmo predicado aos clones** (`getAttribute("aria-expanded") !== "true"` — o atributo é clonado).
- **Bug 4 — `setStartBefore/EndAfter` incondicionais descartavam texto anterior**: a seleção começando **antes** do card tinha o início do range movido para antes do card → o texto do usuário selecionado sumia da cópia (medido: seleção de 174 chars copiou só os 1092 da tool). Fix: extensão **condicional** — `if (firstCard.contains(range.startContainer)) range.setStartBefore(firstCard)` (idem para o fim com o último card).
- **Refinamento**: `toolCardLines` virou `WeakMap` (GC, sem cleanup no unmount) e os cards passam a ser coletados com `document.querySelectorAll("[data-tool-card]")` (ordem de documento natural, sem comparator de sort, sem filtro `isConnected`); fallback `text || range.toString()` (1 linha, nunca mais clipboard vazio).
- Verificação CDP (Chrome headless real, chunk `_id-kStVsVVh.js`): contido no card → conteúdo completo; spanning (prosa acima + card) → prosa **preservada** + tool completa; textarea focado + seleção no chat → conteúdo completo; copy do composer → nativo (não interceptado); colapsado+expandido na mesma seleção → conteúdo completo sem bail.

### 17.7 Refinamento: pedaço da tool → nativo; até a reticência → conteúdo completo (feedback do usuário)

- Relato: "copiando apenas um pedaço, já está copiando tudo" — o handler §17.6 expandia **qualquer** card colapsado que a seleção tocasse (`intersectsNode`), mesmo com 10 chars do label selecionados.
- Fix: decisão **por card** (conjunto `expandable`) no lugar do filtro genérico, restaurando a semântica do §14.3.1:
  1. `aria-expanded === "true"` ou fora do range (`!range.intersectsNode(card)`) → pulo
  2. label via `[class*='truncate']`; sem label → pulo
  3. **truncado**: `labelEl.scrollWidth > labelEl.clientWidth + 1 || labelEl.textContent?.endsWith("...")` — card não-truncado → nativo
  4. **alcança a reticência** (mesmos números do §14.3.1, agora com o rect do range inteiro): `selRect.left < labelRight && selRect.right >= labelRight - 24` → `expandable`
- `expandable` vazio → return (copy nativo). Extensão do range (`setStartBefore/EndAfter` condicionais) só em torno do 1º/último card **expandable**; pareamento: `clones` = todos os cards no fragmento (incl. expandidos) × `inRange` = cards vivos no range estendido, por ordem de documento, substituindo o clone **só** dos expandable.
- Verificação CDP (chunk `_id-DoNj5gA-.js`): 10 chars do label → `prev:false` (nativo, só o pedaço); label inteiro / card inteiro / zona da reticência (últimos 8 chars) → conteúdo completo; spanning → prosa + tool; textarea focado → completo; composer → nativo; misto colapsado+expandido → completo.

### 17.8 Trigger por caret (busca binária) — borda da caixa não é o fim do texto (feedback do usuário)

- Relato: "não está sendo ativada quando selecionamos até encostar no ..., às vezes está acontecendo antes" — o check de 24px da §17.7 era instável.
- **Causa (medida com drags reais via CDP)**: `labelEl.getBoundingClientRect().right` (borda da caixa) **não é o fim do texto** — dois casos extremos medidos:
  - caixa mais larga que o texto (texto de 31 chars termina em 664.4, caixa vai até 708) → o caret máximo (664.4) ficava fora da zona de 24px (≥ 684) → **nunca disparava**
  - caixa 0-width (`clientWidth: 0`, texto de 583px) → qualquer seleção passava do limiar → **disparava antes**
  - sem tolerância fixa serve para ambos (diferenças medidas: 43.6px e -263px).
- **Fix**: o trigger compara **posições de caret** (fim do texto real), não a borda da caixa:
  - `cap` por card: **busca binária** no text node do label — maior offset `i` com `caretX(i) <= boxRight − 1` (última fronteira de caractere antes do clip; para texto que cabe, = fim do texto). ~log2(len) ranges construídos, desprezível.
  - `selEndOnRow`: max right dos `range.getClientRects()` filtrados pela faixa-y do card (a linha do card) — direção-agnóstico; seleção que raspa o card (spanning) mostra só o pedaço na linha dele.
  - trigger: `selEndOnRow >= cap − 4` (margem de subpixel; a fronteira anterior fica ~7px antes → separação limpa de "1 char antes").
- Verificação CDP com **drags reais** (chunk `_id-BpseJFYL.js`; seleção limpa antes de cada drag — sem isso o resultado fica corrompido por seleção antiga):
  - bash truncado: drag a 2 chars do cap → `prev:false`; no cap (offset da reticência) → completo (1092 chars); além da caixa → completo (40 chars do texto inteiro); parcial (10 chars) → nativo
  - read clipado (67 chars, texto 482px > caixa 262px): 2 chars antes → nativo; no cap → completo (12640 chars); além → completo
  - spanning (prosa acima + tool) → prosa preservada + tool completa; textarea focado → completo; composer → nativo; misto colapsado+expandido → completo (5586 chars)

## 18. Sessões principais na lista + painel TASKS (hierarquia de sessões filhas)

### 18.1 Relato

- A lista de sessões (sidebar e home mobile) exibia **todas** as sessões, inclusive as filhas (criadas via `/fork` no composer) — poluindo a navegação.
- Pedido: listar só as **principais** (`parentID` ausente); botão **TASKS** ao lado do Git (visível só com sessão aberta) abre painel lateral direito com a hierarquia da sessão atual — raiz + filhas aninhadas com chevrons — clicar navega para a sessão e fecha o painel.

### 18.2 Decisão de arquitetura

- **Sem endpoint novo**: `Session.parentID` já chega no `GET /sessions` e nos eventos SSE (`session.created/updated` — `use-opencode-events.ts` faz upsert da `Session` completa, que inclui `parentID`). A hierarquia é montada client-side a partir da cache `useSessions()` — funciona para qualquer backend que devolva `parentID` (o SDK v2 tem `session.children()`, mas não foi exposto: desnecessário).
- Raiz: sobe por `parentID` a partir da sessão atual até o topo; se o pai não estiver na lista (órfã), o topo conhecido vira a raiz.
- Filhos: `parentID === id`, ordenados por `time.updated` desc (mesmo critério do `sortSessions`).

### 18.3 Implementação

- `app-sidebar.tsx` — `mainSessions = sessions.filter(s => !s.parentID)` (useMemo) e map sobre ela.
- `empty-state.tsx` — mesmo filtro no `length === 0` e no map (lista mobile).
- `app-sidebar-nav.tsx`:
  - botão **TASKS** (`ListTreeIcon` novo em `icons/lucide.tsx`, `createAppIcon(ListTree, "14px")`) renderizado só quando `sessionId` existe (`{sessionId && ...}`); Git continua com `isDisabled` como era.
  - `<Sheet side="right">` mais largo (`className="sm:max-w-96"` — `sheetContentStyles` faz merge via tailwind-merge, vence o `sm:max-w-80` base) com `SheetHeader` (Title "Tasks" + description = título da raiz) e a árvore no body.
  - `SessionTreeNode` recursivo: chevron (`ChevronDown/ChevronRight`) + botão de seleção; indentação `depth * 16px`; nós folha têm bolinha no lugar do chevron (alinhamento); sessão atual com `intent="secondary"`; colapso por `Set<string>` no estado do componente; `onSelect` navega (`/session/$id`) e fecha o Sheet.

### 18.4 Verificação

- tsc: só os 3 erros pré-existentes; build limpo.
- CDP (mobile 390x844 + desktop 1280x800): `/fork` cria filha → some da sidebar/lista home; TASKS visível só com sessão aberta; painel mostra raiz+filhas aninhadas, chevrons colapsam/expandem, clique navega e fecha; Git intacto.

### 18.5 Arquivos

- `apps/web/src/components/app-sidebar.tsx` — filtro `mainSessions`.
- `apps/web/src/components/empty-state.tsx` — filtro na lista mobile.
- `apps/web/src/components/icons/lucide.tsx` — `ListTreeIcon`.
- `apps/web/src/components/app-sidebar-nav.tsx` — botão TASKS, Sheet, `findRoot`/`childrenOf`/`SessionTreeNode`.




