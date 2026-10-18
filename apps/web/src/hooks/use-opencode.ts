import useSWR from "swr";
import { useInstanceStore } from "@/stores/instance-store";
import {
  backendBasePath,
  normalizeProvider,
  type BackendProvider,
} from "@/lib/backend-url";
import { getResponseErrorMessage } from "@/lib/error-message";
import {
  DEFAULT_GIT_DIFF_MODE,
  type GitDiffMode,
} from "@/lib/git-refs";
import type { SessionStatus } from "@opencode-ai/sdk/v2";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      await getResponseErrorMessage(res, `Request failed: ${res.status}`),
    );
  }
  return res.json();
};

export function useBackend() {
  const instance = useInstanceStore((s) => s.instance);
  return instance
    ? {
        port: instance.port,
        provider: normalizeProvider(instance.provider),
        basePath: backendBasePath(instance.provider, instance.port),
      }
    : null;
}

export function useInstances() {
  return useSWR("/api/instances", fetcher, {
    refreshInterval: 5_000,
    revalidateOnFocus: true,
  });
}

export function useSessions() {
  const backend = useBackend();

  return useSWR(backend ? `${backend.basePath}/sessions` : null, fetcher);
}

export function useSession(id: string | null) {
  const backend = useBackend();

  return useSWR(
    backend && id ? `${backend.basePath}/session/${id}` : null,
    fetcher,
  );
}

export function useSessionMessages(id: string | null) {
  const backend = useBackend();

  return useSWR(
    backend && id ? `${backend.basePath}/session/${id}/messages` : null,
    fetcher,
  );
}

export function useSessionStatuses() {
  const backend = useBackend();

  return useSWR<Record<string, SessionStatus>>(
    backend ? `${backend.basePath}/session/status` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      refreshInterval: (statuses) =>
        Object.values(statuses ?? {}).some((status) => status.type !== "idle")
          ? 1000
          : 0,
    },
  );
}

export function useConfig() {
  const backend = useBackend();

  return useSWR<import("@opencode-ai/sdk/v2").Config>(
    backend ? `${backend.basePath}/config` : null,
    fetcher,
  );
}

export function useProviders() {
  const backend = useBackend();

  return useSWR(backend ? `${backend.basePath}/providers` : null, fetcher);
}

export function useAgents() {
  const backend = useBackend();

  return useSWR(backend ? `${backend.basePath}/agents` : null, fetcher);
}

export function useHealth() {
  const backend = useBackend();

  return useSWR(backend ? `${backend.basePath}/health` : null, fetcher);
}

export function useMcpStatus() {
  const backend = useBackend();

  return useSWR<Record<string, import("@opencode-ai/sdk/v2").McpStatus>>(
    backend ? `${backend.basePath}/mcp/status` : null,
    fetcher,
    {
      revalidateOnFocus: false,
    },
  );
}

export function useLspStatus() {
  const backend = useBackend();

  return useSWR<import("@opencode-ai/sdk/v2").LspStatus[]>(
    backend ? `${backend.basePath}/lsp/status` : null,
    fetcher,
    {
      revalidateOnFocus: false,
    },
  );
}

export function useFormatterStatus() {
  const backend = useBackend();

  return useSWR<import("@opencode-ai/sdk/v2").FormatterStatus[]>(
    backend ? `${backend.basePath}/formatter/status` : null,
    fetcher,
    {
      revalidateOnFocus: false,
    },
  );
}

export function useToggleMcp() {
  const backend = useBackend();

  return async (name: string, enabled: boolean) => {
    if (!backend) throw new Error("No instance selected");

    const res = await fetch(
      `${backend.basePath}/mcp/${encodeURIComponent(name)}/${
        enabled ? "disconnect" : "connect"
      }`,
      { method: "POST" },
    );

    if (!res.ok) {
      const fallback = `Failed to ${enabled ? "disable" : "enable"} MCP server`;
      const body = await res.json().catch(() => null);
      throw new Error(
        body?.data?.message ?? body?.message ?? `${fallback}: ${res.status}`,
      );
    }

    return res.json();
  };
}

export function useCurrentProject() {
  const backend = useBackend();

  return useSWR(
    backend ? `${backend.basePath}/project/current` : null,
    fetcher,
  );
}

export function useHostname() {
  return useSWR("/api/system/hostname", fetcher);
}

export function useCreateSession() {
  const backend = useBackend();

  return async (title?: string) => {
    if (!backend) throw new Error("No instance selected");

    const res = await fetch(`${backend.basePath}/session/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });

    if (!res.ok) {
      throw new Error(`Failed to create session: ${res.status}`);
    }

    return res.json();
  };
}

export function useDeleteSession() {
  const backend = useBackend();

  return async (sessionId: string) => {
    if (!backend) throw new Error("No instance selected");

    const res = await fetch(`${backend.basePath}/session/${sessionId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      throw new Error(`Failed to delete session: ${res.status}`);
    }

    return res.json();
  };
}

export function gitDiffKey(port: number, provider?: BackendProvider) {
  return `${backendBasePath(provider, port)}/git/diff`;
}

export function gitBranchesKey(port: number, provider?: BackendProvider) {
  return `${backendBasePath(provider, port)}/git/branches`;
}

export function isGitDiffKey(
  key: unknown,
  port: number,
  provider?: BackendProvider,
) {
  if (typeof key !== "string") return false;
  const base = gitDiffKey(port, provider);
  return key === base || key.startsWith(`${base}?`);
}

export interface GitDiffParams {
  from: string;
  to: string;
  mode?: GitDiffMode;
}

export interface GitDiffResponse {
  diff: string;
  worktree: string;
  from?: string;
  to?: string;
  mode?: GitDiffMode;
  mergeBase?: string;
  commits?: number;
  currentBranch?: string;
}

export function useGitDiff(params?: GitDiffParams | null) {
  const backend = useBackend();
  const query = params
    ? `?${new URLSearchParams({
        from: params.from,
        to: params.to,
        mode: params.mode ?? DEFAULT_GIT_DIFF_MODE,
      })}`
    : "";

  return useSWR<GitDiffResponse>(
    backend ? `${gitDiffKey(backend.port, backend.provider)}${query}` : null,
    fetcher,
    { keepPreviousData: true },
  );
}

export interface GitBranchInfo {
  name: string;
  kind: "local" | "remote";
  sha: string;
  date: string;
  subject: string;
}

export interface GitBranchesResponse {
  worktree: string;
  currentBranch: string;
  defaults: { base: string };
  branches: GitBranchInfo[];
}

export function useGitBranches(enabled = true) {
  const backend = useBackend();

  return useSWR<GitBranchesResponse>(
    backend && enabled
      ? gitBranchesKey(backend.port, backend.provider)
      : null,
    fetcher,
    { keepPreviousData: true, revalidateOnFocus: false },
  );
}

export function usePermissions() {
  const backend = useBackend();

  return useSWR(backend ? `${backend.basePath}/permissions` : null, fetcher);
}

export function useReplyPermission() {
  const backend = useBackend();

  return async (
    requestId: string,
    reply: "once" | "always" | "reject",
    message?: string,
  ) => {
    if (!backend) throw new Error("No instance selected");

    const res = await fetch(
      `${backend.basePath}/permission/${requestId}/reply`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply, message }),
      },
    );

    if (!res.ok) {
      throw new Error(`Failed to reply to permission: ${res.status}`);
    }

    return res.json();
  };
}

export function useQuestions() {
  const backend = useBackend();

  return useSWR(backend ? `${backend.basePath}/questions` : null, fetcher);
}

export function useReplyQuestion() {
  const backend = useBackend();

  return async (requestId: string, answers: string[][]) => {
    if (!backend) throw new Error("No instance selected");

    const res = await fetch(`${backend.basePath}/question/${requestId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });

    if (!res.ok) {
      throw new Error(`Failed to reply to question: ${res.status}`);
    }

    return res.json();
  };
}

export function useRejectQuestion() {
  const backend = useBackend();

  return async (requestId: string) => {
    if (!backend) throw new Error("No instance selected");

    const res = await fetch(
      `${backend.basePath}/question/${requestId}/reject`,
      {
        method: "POST",
      },
    );

    if (!res.ok) {
      throw new Error(`Failed to reject question: ${res.status}`);
    }

    return res.json();
  };
}

export function useAbortSession() {
  const backend = useBackend();

  return async (sessionId: string) => {
    if (!backend) throw new Error("No instance selected");

    const res = await fetch(`${backend.basePath}/session/${sessionId}/abort`, {
      method: "POST",
    });

    if (!res.ok) {
      throw new Error(`Failed to abort session: ${res.status}`);
    }

    return res.json();
  };
}

export function useUpdateSession() {
  const backend = useBackend();

  return async (sessionId: string, title: string) => {
    if (!backend) throw new Error("No instance selected");

    const res = await fetch(`${backend.basePath}/session/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });

    if (!res.ok) {
      throw new Error(`Failed to rename session: ${res.status}`);
    }

    return res.json();
  };
}

export function useMoveSession() {
  const backend = useBackend();

  return async (sessionId: string, directory: string) => {
    if (!backend) throw new Error("No instance selected");

    const res = await fetch(`${backend.basePath}/session/${sessionId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ directory }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(
        body?.data?.message ?? `Failed to move session: ${res.status}`,
      );
    }

    return res.json();
  };
}
