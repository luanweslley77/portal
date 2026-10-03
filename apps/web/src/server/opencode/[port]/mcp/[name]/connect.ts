import { defineHandler } from "nitro/h3";
import { getOpencodeClient } from "../../../../lib/opencode-client";
import { parsePort, parseRouteParam } from "../../../../lib/validation";

export default defineHandler(async (event) => {
  const port = parsePort(event);
  const name = parseRouteParam(event, "name");
  const client = getOpencodeClient(port);
  const result = await client.mcp.connect({ name });
  return result.data;
});
