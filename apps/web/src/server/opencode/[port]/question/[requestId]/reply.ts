import { z } from "zod/v4";
import { HTTPError, defineHandler } from "nitro/h3";
import { formatErrorMessage } from "@/lib/error-message";
import { getOpencodeClient } from "../../../../lib/opencode-client";
import { runWithOpencodeDirectories } from "../../../../lib/opencode-directories";
import { parsePort, parseRouteParam, parseBody } from "../../../../lib/validation";

const questionReplySchema = z.object({
  answers: z.array(z.array(z.string())),
});

export default defineHandler(async (event) => {
  const port = parsePort(event);
  const requestId = parseRouteParam(event, "requestId");
  const body = await parseBody(event, questionReplySchema);

  const client = getOpencodeClient(port);
  const result = await runWithOpencodeDirectories(port, (directory) =>
    client.question.reply({
      requestID: requestId,
      answers: body.answers,
      ...(directory ? { directory } : {}),
    }),
  );

  if (result.error) {
    throw new HTTPError(
      formatErrorMessage(result.error, "Failed to reply to question"),
      { status: 500 },
    );
  }

  return result.data;
});
