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
  messageID: z.string().optional(),
});

type SessionWithParts = {
  info: {
    id: string;
    role: "user" | "assistant";
    time: { created: number };
    parentID?: string;
  };
  parts: { type: string }[];
};

function firstErrorMessage(result: { error?: unknown }): string | null {
  if (!result.error) return null;
  const data = result.error as {
    data?: { message?: string };
    message?: string;
  };
  return data.data?.message ?? data.message ?? "Unknown error";
}

export default defineHandler(async (event) => {
  const port = parsePort(event);
  const id = parseRouteParam(event, "id");
  const body = await parseBody(event, builtinBodySchema);

  const client = getOpencodeClient(port);
  try {
    switch (body.action) {
      case "undo": {
        if (body.messageID) {
          const result = await client.session.revert({
            sessionID: id,
            messageID: body.messageID,
          });
          const error = firstErrorMessage(result);
          if (error) {
            throw new HTTPError(`Failed to run /undo: ${error}`, {
              status: 500,
            });
          }
          break;
        }

        const session = await client.session.get({ sessionID: id });
        const sessionError = firstErrorMessage(session);
        if (sessionError) {
          throw new HTTPError(`Failed to run /undo: ${sessionError}`, {
            status: 500,
          });
        }

        const statuses = await client.session.status();
        const status = statuses.data?.[id];
        if (status?.type !== "idle") {
          await client.session.abort({ sessionID: id }).catch(() => {});
        }

        const messages = await client.session.messages({ sessionID: id });
        const messageError = firstErrorMessage(messages);
        if (messageError) {
          throw new HTTPError(`Failed to run /undo: ${messageError}`, {
            status: 500,
          });
        }

        const revertMessageID = session.data?.revert?.messageID;
        const lastUser = (messages.data ?? ([] as SessionWithParts[]))
          .filter(
            (message) =>
              message.info.role === "user" &&
              (!revertMessageID || message.info.id < revertMessageID),
          )
          .at(-1);
        if (!lastUser) {
          throw new HTTPError("Nothing to undo", { status: 400 });
        }

        const result = await client.session.revert({
          sessionID: id,
          messageID: lastUser.info.id,
        });
        const error = firstErrorMessage(result);
        if (error) {
          throw new HTTPError(`Failed to run /undo: ${error}`, {
            status: 500,
          });
        }
        break;
      }
      case "redo": {
        const session = await client.session.get({ sessionID: id });
        const sessionError = firstErrorMessage(session);
        if (sessionError) {
          throw new HTTPError(`Failed to run /redo: ${sessionError}`, {
            status: 500,
          });
        }

        const revertMessageID = session.data?.revert?.messageID;
        if (!revertMessageID) {
          throw new HTTPError("Nothing to redo", { status: 400 });
        }

        const messages = await client.session.messages({ sessionID: id });
        const messageError = firstErrorMessage(messages);
        if (messageError) {
          throw new HTTPError(`Failed to run /redo: ${messageError}`, {
            status: 500,
          });
        }

        const nextUser = (messages.data ?? ([] as SessionWithParts[]))
          .filter(
            (message) =>
              message.info.role === "user" &&
              message.info.id > revertMessageID,
          )
          .at(0);

        const result = nextUser
          ? await client.session.revert({
              sessionID: id,
              messageID: nextUser.info.id,
            })
          : await client.session.unrevert({ sessionID: id });
        const error = firstErrorMessage(result);
        if (error) {
          throw new HTTPError(`Failed to run /redo: ${error}`, {
            status: 500,
          });
        }
        break;
      }
      case "compact": {
        const session = await client.session.get({ sessionID: id });
        const sessionError = firstErrorMessage(session);
        if (sessionError) {
          throw new HTTPError(`Failed to run /compact: ${sessionError}`, {
            status: 500,
          });
        }

        const model = session.data?.model;
        const result = await client.session.summarize({
          sessionID: id,
          providerID: model?.providerID,
          modelID: model?.id,
          auto: true,
        });
        const error = firstErrorMessage(result);
        if (error) {
          throw new HTTPError(`Failed to run /compact: ${error}`, {
            status: 500,
          });
        }
        break;
      }
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
    if (error instanceof HTTPError) throw error;
    throw new HTTPError(
      formatErrorMessage(error, `Failed to run /${body.action}`),
      { status: 500 },
    );
  }

  return { accepted: true, action: body.action };
});
