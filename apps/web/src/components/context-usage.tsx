import { useMemo } from "react";
import { useProviders } from "@/hooks/use-opencode";
import { useSessionMessages } from "@/hooks/use-session-messages";

function formatTokenCount(tokens: number) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return `${tokens}`;
}

interface ContextUsageProps {
  sessionId: string | undefined;
}

export function ContextUsage({ sessionId }: ContextUsageProps) {
  const { sessionMessages } = useSessionMessages(sessionId);
  const { data: providersData } = useProviders();

  const usage = useMemo(() => {
    const last = [...(sessionMessages ?? [])]
      .reverse()
      .find(
        (message) =>
          message.type === "assistant" &&
          (message.tokens?.output ?? 0) > 0,
      );
    if (!last || last.type !== "assistant") return null;

    const tokens =
      (last.tokens?.input ?? 0) +
      (last.tokens?.output ?? 0) +
      (last.tokens?.reasoning ?? 0) +
      (last.tokens?.cache?.read ?? 0) +
      (last.tokens?.cache?.write ?? 0);
    if (tokens <= 0) return null;

    const models = (providersData?.providers ?? []).find(
      (provider: { id: string }) => provider.id === last.model.providerID,
    )?.models;
    const context: number | undefined =
      models?.[last.model.id]?.limit?.context;
    const percent = context ? Math.round((tokens / context) * 100) : null;

    return { tokens, context, percent };
  }, [sessionMessages, providersData]);

  if (!usage) return null;

  const label = usage.context
    ? `Context: ${usage.tokens.toLocaleString()} / ${usage.context.toLocaleString()} tokens (${usage.percent}%)`
    : `Context: ${usage.tokens.toLocaleString()} tokens`;

  return (
    <span
      aria-label={label}
      className="font-mono text-xs whitespace-nowrap text-muted-fg tabular-nums"
    >
      {formatTokenCount(usage.tokens)}
      {usage.percent !== null && ` (${usage.percent}%)`}
    </span>
  );
}
