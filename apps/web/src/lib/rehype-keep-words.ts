type HastNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

const SKIP_TAGS = new Set(["pre"]);

function wrapWords(children: HastNode[]): HastNode[] {
  const next: HastNode[] = [];
  for (const child of children) {
    if (child.type === "text" && child.value) {
      for (const part of child.value.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) {
          next.push({ type: "text", value: part });
        } else {
          next.push({
            type: "element",
            tagName: "span",
            properties: { className: ["prose-word"] },
            children: [{ type: "text", value: part }],
          });
        }
      }
      continue;
    }

    if (child.children && !(child.tagName && SKIP_TAGS.has(child.tagName))) {
      child.children = wrapWords(child.children);
    }
    next.push(child);
  }
  return next;
}

function visit(node: HastNode) {
  if (!node.children) return;
  if (node.type === "element" && (node.tagName === "td" || node.tagName === "th")) {
    node.children = wrapWords(node.children);
    return;
  }
  for (const child of node.children) visit(child);
}

/**
 * Envolve cada palavra das células de tabela num <span.prose-word> (CSS:
 * white-space: nowrap). O CSS sozinho não impede a quebra em hífens
 * (word-break: keep-all não cobre texto latino); com os espaços fora dos
 * spans, a tabela continua quebrando entre palavras, mas nunca dentro delas.
 */
export function rehypeKeepWords() {
  return (tree: HastNode) => {
    visit(tree);
  };
}
