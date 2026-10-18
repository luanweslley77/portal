import { defineHandler } from "nitro/h3";
import type { PermissionRequest } from "@opencode-ai/sdk/v2";
import { getOpencodeClient } from "../../lib/opencode-client";
import { getOpencodeDirectories } from "../../lib/opencode-directories";
import { parsePort } from "../../lib/validation";

export default defineHandler(async (event) => {
  const port = parsePort(event);
  const client = getOpencodeClient(port);
  const directories = await getOpencodeDirectories(port);

  if (directories.length === 0) {
    const result = await client.permission.list();
    return result.data ?? [];
  }

  const results = await Promise.all(
    directories.map((directory) =>
      client.permission.list({ directory }).catch(() => null),
    ),
  );

  const merged = new Map<string, PermissionRequest>();
  for (const result of results) {
    for (const permission of result?.data ?? []) {
      merged.set(permission.id, permission);
    }
  }

  return [...merged.values()];
});
