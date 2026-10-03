import { defineHandler } from "nitro/h3";
import type { QuestionRequest } from "@opencode-ai/sdk/v2";
import { getOpencodeClient } from "../../lib/opencode-client";
import { getOpencodeDirectories } from "../../lib/opencode-directories";
import { parsePort } from "../../lib/validation";

export default defineHandler(async (event) => {
  const port = parsePort(event);
  const client = getOpencodeClient(port);
  const directories = await getOpencodeDirectories(port);

  if (directories.length === 0) {
    const result = await client.question.list();
    return result.data ?? [];
  }

  const results = await Promise.all(
    directories.map((directory) =>
      client.question.list({ directory }).catch(() => null),
    ),
  );

  const merged = new Map<string, QuestionRequest>();
  for (const result of results) {
    for (const question of result?.data ?? []) {
      merged.set(question.id, question);
    }
  }

  return [...merged.values()];
});
