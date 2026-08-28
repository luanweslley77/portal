import { z } from "zod/v4";
import { HTTPError, defineHandler } from "nitro/h3";
import { formatErrorMessage } from "@/lib/error-message";
import { getOpencodeClient } from "../../../../lib/opencode-client";
import {
  parsePort,
  parseRouteParam,
  parseBody,
} from "../../../../lib/validation";

const commandBodySchema = z.object({
  messageID: z.string().optional(),
  command: z.string().min(1),
  arguments: z.string().optional(),
  agent: z.string().optional(),
  variant: z.string().optional(),
  model: z.string().optional(),
});

export default defineHandler(async (event) => {
  const port = parsePort(event);
  const id = parseRouteParam(event, "id");
  const body = await parseBody(event, commandBodySchema);

  const client = getOpencodeClient(port);
  try {
    await client.session.command({
      sessionID: id,
      command: body.command,
      arguments: body.arguments,
      messageID: body.messageID,
      agent: body.agent,
      variant: body.variant,
      model: body.model,
    });
  } catch (error) {
    throw new HTTPError(formatErrorMessage(error, "Failed to run command"), {
      status: 500,
    });
  }

  return {
    accepted: true,
    messageID: body.messageID,
  };
});
