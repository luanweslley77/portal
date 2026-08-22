import { defineHandler, getQuery } from "nitro/h3";
import { getOpencodeClient } from "../../lib/opencode-client";
import { parsePort } from "../../lib/validation";

export default defineHandler(async (event) => {
  const port = parsePort(event);
  const query = getQuery(event);
  const directory =
    typeof query.directory === "string" && query.directory.trim().length > 0
      ? query.directory
      : undefined;
  const client = getOpencodeClient(port);
  const result = await client.command.list(
    directory ? { directory } : undefined,
  );
  return result.data;
});
