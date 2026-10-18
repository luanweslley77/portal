import { z } from "zod/v4";
import { HTTPError, defineHandler } from "nitro/h3";
import { formatErrorMessage } from "@/lib/error-message";
import { getOpencodeClient } from "../../../../lib/opencode-client";
import { runWithOpencodeDirectories } from "../../../../lib/opencode-directories";
import { parsePort, parseRouteParam, parseBody } from "../../../../lib/validation";

const permissionReplySchema = z.object({
  reply: z.enum(["once", "always", "reject"]),
  message: z.string().optional(),
});

function isNotFound(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { _tag?: unknown; name?: unknown };
  return (
    String(record._tag ?? "").includes("NotFound") ||
    String(record.name ?? "").includes("NotFound")
  );
}

export default defineHandler(async (event) => {
  const port = parsePort(event);
  const requestId = parseRouteParam(event, "requestId");
  const body = await parseBody(event, permissionReplySchema);

  const client = getOpencodeClient(port);
  const result = await runWithOpencodeDirectories(port, (directory) =>
    client.permission.reply({
      requestID: requestId,
      reply: body.reply,
      message: body.message,
      ...(directory ? { directory } : {}),
    }),
  );

  if (result.error) {
    throw new HTTPError(
      formatErrorMessage(result.error, "Failed to reply to permission"),
      { status: isNotFound(result.error) ? 404 : 500 },
    );
  }

  return result.data;
});
