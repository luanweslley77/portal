import { z } from "zod/v4";
import { HTTPError, defineHandler } from "nitro/h3";
import { formatErrorMessage } from "@/lib/error-message";
import { getOpencodeClient } from "../../../../lib/opencode-client";
import {
  parsePort,
  parseRouteParam,
  parseBody,
} from "../../../../lib/validation";

const patchBodySchema = z.object({
  title: z.string().min(1),
});

export default defineHandler(async (event) => {
  const port = parsePort(event);
  const id = parseRouteParam(event, "id");
  const body = await parseBody(event, patchBodySchema);

  const client = getOpencodeClient(port);
  try {
    const result = await client.session.update({
      sessionID: id,
      title: body.title,
    });
    return result.data;
  } catch (error) {
    throw new HTTPError(
      formatErrorMessage(error, "Failed to rename session"),
      { status: 500 },
    );
  }
});
