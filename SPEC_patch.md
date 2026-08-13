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

