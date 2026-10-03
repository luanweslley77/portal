import { z } from "zod/v4";
import { HTTPError, defineHandler } from "nitro/h3";
import { formatErrorMessage } from "@/lib/error-message";
import {
  getOpencodeBaseUrl,
  getOpencodeClient,
} from "../../../../lib/opencode-client";
import {
  parsePort,
  parseRouteParam,
  parseBody,
} from "../../../../lib/validation";

const moveBodySchema = z.object({
  directory: z.string().min(1),
  moveChanges: z.boolean().optional(),
});

function getAuthHeaders(): Record<string, string> {
  const username = process.env.OPENCODE_SERVER_USERNAME;
  const password = process.env.OPENCODE_SERVER_PASSWORD;
  if (username && password) {
    return {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
    };
  }
  return {};
}

export default defineHandler(async (event) => {
  const port = parsePort(event);
  const id = parseRouteParam(event, "id");
  const body = await parseBody(event, moveBodySchema);

  getOpencodeClient(port);
  try {
    const response = await fetch(
      `${getOpencodeBaseUrl(port)}/experimental/control-plane/move-session`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          sessionID: id,
          destination: { directory: body.directory },
          moveChanges: body.moveChanges ?? false,
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      throw new Error(
        errorBody?.data?.message ?? `Move failed (${response.status})`,
      );
    }

    return { accepted: true };
  } catch (error) {
    throw new HTTPError(formatErrorMessage(error, "Failed to move session"), {
      status: 500,
    });
  }
});
