import useSWR from "swr";
import { useInstanceStore } from "@/stores/instance-store";
import { backendBasePath, type BackendProvider } from "@/lib/backend-url";

export interface SlashCommand {
  name: string;
  description?: string;
  source?: string;
}

const BUILTIN_COMMANDS: SlashCommand[] = [
  { name: "undo", description: "Revert the last message", source: "builtin" },
  { name: "redo", description: "Restore a reverted message", source: "builtin" },
  { name: "compact", description: "Summarize the session", source: "builtin" },
  { name: "share", description: "Share the session", source: "builtin" },
  { name: "unshare", description: "Stop sharing the session", source: "builtin" },
  { name: "fork", description: "Fork the session", source: "builtin" },
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

export function useCommands() {
  const backend = useBackend();
  const key = backend ? `${backend.basePath}/command` : null;

  const { data, error, isLoading } = useSWR<SlashCommand[]>(key, fetcher, {
    revalidateOnFocus: false,
  });

  return {
    commands: [...BUILTIN_COMMANDS, ...(data ?? [])],
    error,
    isLoading,
  };
}
