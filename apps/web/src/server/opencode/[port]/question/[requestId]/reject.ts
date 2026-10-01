import { HTTPError, defineHandler } from "nitro/h3";
import { formatErrorMessage } from "@/lib/error-message";
import { getOpencodeClient } from "../../../../lib/opencode-client";
import { runWithOpencodeDirectories } from "../../../../lib/opencode-directories";
import { parsePort, parseRouteParam } from "../../../../lib/validation";

export default defineHandler(async (event) => {
  const port = parsePort(event);
  const requestId = parseRouteParam(event, "requestId");

  const client = getOpencodeClient(port);
  const result = await runWithOpencodeDirectories(port, (directory) =>
    client.question.reject({
      requestID: requestId,
      ...(directory ? { directory } : {}),
    }),
  );

  if (result.error) {
    throw new HTTPError(
      formatErrorMessage(result.error, "Failed to reject question"),
      { status: 500 },
    );
  }

  return result.data;
});
