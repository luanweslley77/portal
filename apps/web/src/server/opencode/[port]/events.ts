import { defineHandler } from "nitro/h3";
import { getOpencodeClient } from "../../lib/opencode-client";
import {
  getOpencodeDirectories,
  getOpencodeProjectId,
} from "../../lib/opencode-directories";
import { parsePort } from "../../lib/validation";

const encoder = new TextEncoder();

function encodeEvent(data: unknown) {
  return encoder.encode(`event: message\ndata: ${JSON.stringify(data)}\n\n`);
}

// /global/event entrega todas as instâncias (directory) do servidor, com
// envelope { directory, project, payload }. O filtro mantém só o projeto desta
// instância do Portal — sessões em subdiretório (ex.: apps/web) ficam visíveis
// no Portal, mas o stream por instância só cobre o diretório raiz.
export default defineHandler((event) => {
  const port = parsePort(event);
  const client = getOpencodeClient(port);
  const abort = new AbortController();

  event.res.headers.set("Content-Type", "text/event-stream");
  event.res.headers.set("Cache-Control", "no-cache, no-transform");
  event.res.headers.set("Connection", "keep-alive");
  event.res.headers.set("X-Accel-Buffering", "no");
  event.res.headers.set("X-Content-Type-Options", "nosniff");

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        try {
          const projectId = await getOpencodeProjectId(port);
          const events = await client.global.event({
            signal: abort.signal,
            sseMaxRetryAttempts: 0,
          });

          for await (const item of events.stream) {
            if (abort.signal.aborted) break;
            const envelope = item as {
              directory?: unknown;
              project?: unknown;
              payload?: { type?: unknown };
            };
            const payload = envelope.payload;
            if (!payload || typeof payload !== "object") continue;
            if (payload.type === "sync") continue;
            if (typeof envelope.project === "string" && projectId) {
              if (envelope.project !== projectId) continue;
            } else if (typeof envelope.directory === "string") {
              const directories = await getOpencodeDirectories(port);
              if (!directories.includes(envelope.directory)) continue;
            }
            controller.enqueue(encodeEvent(payload));
          }
        } catch (globalError) {
          if (abort.signal.aborted) throw globalError;

          // Backend sem /global/event: mantém o stream por instância.
          const events = await client.event.subscribe(undefined, {
            signal: abort.signal,
            sseMaxRetryAttempts: 0,
          });
          for await (const item of events.stream) {
            if (abort.signal.aborted) break;
            controller.enqueue(encodeEvent(item));
          }
        }
      } catch (error) {
        if (!abort.signal.aborted) {
          controller.enqueue(
            encodeEvent({
              id: `portal-event-error-${Date.now()}`,
              type: "portal.event.error",
              properties: {
                message:
                  error instanceof Error
                    ? error.message
                    : "OpenCode event stream failed",
              },
            }),
          );
        }
      } finally {
        try {
          controller.close();
        } catch {
          // The client may have already closed the stream.
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });
});
