import { getOpencodeClient } from "./opencode-client";

const DIRECTORIES_TTL_MS = 5_000;
const PROJECT_TTL_MS = 30_000;

interface CacheEntry<T> {
  at: number;
  value: T;
}

const directoriesCache = new Map<number, CacheEntry<string[]>>();
const projectCache = new Map<number, CacheEntry<string | null>>();

export async function getOpencodeDirectories(
  port: number,
  fresh = false,
): Promise<string[]> {
  const cached = directoriesCache.get(port);
  const now = Date.now();
  if (!fresh && cached && now - cached.at < DIRECTORIES_TTL_MS) {
    return cached.value;
  }

  try {
    const client = getOpencodeClient(port);
    const sessions = await client.session.list();
    const value = [
      ...new Set(
        (sessions.data ?? [])
          .map((session) => session.directory)
          .filter(
            (directory): directory is string =>
              typeof directory === "string" && directory.length > 0,
          ),
      ),
    ];
    directoriesCache.set(port, { at: now, value });
    return value;
  } catch {
    return cached?.value ?? [];
  }
}

export async function getOpencodeProjectId(
  port: number,
): Promise<string | null> {
  const cached = projectCache.get(port);
  const now = Date.now();
  if (cached && now - cached.at < PROJECT_TTL_MS) {
    return cached.value;
  }

  try {
    const client = getOpencodeClient(port);
    const project = await client.project.current();
    const value = project.data?.id ?? null;
    projectCache.set(port, { at: now, value });
    return value;
  } catch {
    return cached?.value ?? null;
  }
}

interface ReplyResult<T> {
  data?: T;
  error?: unknown;
}

// Permissões e questions vivem na instância (directory) da sessão; o cliente
// do front só conhece o requestID, então tenta o default e depois cada
// directory conhecida do projeto (a que responde primeiro vence).
export async function runWithOpencodeDirectories<T>(
  port: number,
  run: (directory?: string) => Promise<ReplyResult<T>>,
): Promise<ReplyResult<T>> {
  const attempted = new Set<string | undefined>([undefined]);

  const first = await run(undefined);
  if (!first.error) return first;

  let last = first;
  const directories = await getOpencodeDirectories(port);
  for (const directory of directories) {
    attempted.add(directory);
    const result = await run(directory);
    if (!result.error) return result;
    last = result;
  }

  const refreshed = await getOpencodeDirectories(port, true);
  for (const directory of refreshed) {
    if (attempted.has(directory)) continue;
    const result = await run(directory);
    if (!result.error) return result;
    last = result;
  }

  return last;
}

export function clearOpencodeDirectoryCaches(port?: number) {
  if (port) {
    directoriesCache.delete(port);
    projectCache.delete(port);
    return;
  }
  directoriesCache.clear();
  projectCache.clear();
}
