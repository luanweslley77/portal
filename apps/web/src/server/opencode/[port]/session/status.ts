import { defineHandler } from "nitro/h3";
import type { SessionStatus } from "@opencode-ai/sdk/v2";
import { getOpencodeClient } from "../../../lib/opencode-client";
import { getOpencodeDirectories } from "../../../lib/opencode-directories";
import { parsePort } from "../../../lib/validation";

export default defineHandler(async (event) => {
  const port = parsePort(event);
  const client = getOpencodeClient(port);
  const directories = await getOpencodeDirectories(port);

  if (directories.length === 0) {
    const result = await client.session.status();
    return result.data ?? {};
  }

  const results = await Promise.all(
    directories.map((directory) =>
      client.session.status({ directory }).catch(() => null),
    ),
  );

  const merged: Record<string, SessionStatus> = {};
  for (const result of results) {
    Object.assign(merged, result?.data ?? {});
  }

  return merged;
});
