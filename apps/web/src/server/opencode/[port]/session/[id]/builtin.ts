import { z } from "zod/v4";
import { HTTPError, defineHandler } from "nitro/h3";
import { formatErrorMessage } from "@/lib/error-message";
import { getOpencodeClient } from "../../../../lib/opencode-client";
import {
  parsePort,
  parseRouteParam,
  parseBody,
} from "../../../../lib/validation";

const builtinBodySchema = z.object({
  action: z.enum(["undo", "redo", "compact", "share", "unshare", "fork"]),
});

export default defineHandler(async (event) => {
  const port = parsePort(event);
  const id = parseRouteParam(event, "id");
  const body = await parseBody(event, builtinBodySchema);

  const client = getOpencodeClient(port);
  try {
    switch (body.action) {
      case "undo":
        await client.session.revert({ sessionID: id });
        break;
      case "redo":
        await client.session.unrevert({ sessionID: id });
        break;
      case "compact":
        await client.session.summarize({ sessionID: id, auto: true });
        break;
      case "share":
        await client.session.share({ sessionID: id });
        break;
      case "unshare":
        await client.session.unshare({ sessionID: id });
        break;
      case "fork":
        await client.session.fork({ sessionID: id });
        break;
    }
  } catch (error) {
    throw new HTTPError(
      formatErrorMessage(error, `Failed to run /${body.action}`),
      { status: 500 },
    );
  }

  return { accepted: true, action: body.action };
});
