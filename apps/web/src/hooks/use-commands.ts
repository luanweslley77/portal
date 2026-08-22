import useSWR from "swr";
import { useInstanceStore } from "@/stores/instance-store";
import { backendBasePath, type BackendProvider } from "@/lib/backend-url";

export interface SlashCommand {
  name: string;
  description?: string;
  source?: string;
}

const BUILTIN_COMMANDS: SlashCommand[] = [
  { name: "compact", description: "Summarize the session", source: "builtin" },
  { name: "share", description: "Share the session", source: "builtin" },
  { name: "unshare", description: "Stop sharing the session", source: "builtin" },
  { name: "fork", description: "Fork the session", source: "builtin" },
  { name: "mcps", description: "Enable/disable MCP servers", source: "builtin" },
  { name: "status", description: "View session/system status", source: "builtin" },
];

const fetcher = async (url: string): Promise<SlashCommand[]> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch commands: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
};

function useBackend() {
  const instance = useInstanceStore((s) => s.instance);
  return instance
    ? {
        port: instance.port,
        provider: instance.provider,
        basePath: backendBasePath(instance.provider, instance.port),
      }
    : null;
}

export function useCommands(directory?: string) {
  const backend = useBackend();
  const isOpencode = !backend || backend.provider === undefined || backend.provider === "opencode";
  const qs = directory ? `?directory=${encodeURIComponent(directory)}` : "";
  const key = backend && isOpencode ? `${backend.basePath}/command${qs}` : null;

  const { data, error, isLoading } = useSWR<SlashCommand[]>(key, fetcher, {
    revalidateOnFocus: false,
  });

  return {
    commands: [...BUILTIN_COMMANDS, ...(data ?? [])],
    error,
    isLoading,
  };
}
