import { z } from "zod/v4";
import { HTTPError, defineHandler } from "nitro/h3";
import { formatErrorMessage } from "@/lib/error-message";
import { getOpencodeClient } from "../../../../lib/opencode-client";
import {
  parsePort,
  parseRouteParam,
  parseBody,
} from "../../../../lib/validation";

const shellBodySchema = z.object({
  messageID: z.string().optional(),
  command: z.string().min(1),
  agent: z.string().optional(),
  model: z
    .object({
      providerID: z.string(),
      modelID: z.string(),
    })
    .optional(),
});

export default defineHandler(async (event) => {
  const port = parsePort(event);
  const id = parseRouteParam(event, "id");
  const body = await parseBody(event, shellBodySchema);

  const client = getOpencodeClient(port);
  try {
    await client.session.shell({
      sessionID: id,
      command: body.command,
      messageID: body.messageID,
      agent: body.agent,
      model: body.model,
    });
  } catch (error) {
    throw new HTTPError(formatErrorMessage(error, "Failed to run shell command"), {
      status: 500,
    });
  }

  return {
    accepted: true,
    messageID: body.messageID,
  };
});
