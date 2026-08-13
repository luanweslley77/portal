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
3. **`session/$id.tsx`:** polling de fallback reduzido de **1500ms → 10000ms** (o SSE cobre o streaming; o polling vira só rede de segurança).

### 6.4 Verificação empírica pós-fix

- Sessão grande aberta + subagent explore rodando em paralelo: **apenas 2 GET /messages** (inicial + um eventual), resto são `session/status` leves. Antes: ~4 refetches de 2.7MB por segundo durante streaming.
