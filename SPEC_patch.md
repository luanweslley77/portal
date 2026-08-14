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
