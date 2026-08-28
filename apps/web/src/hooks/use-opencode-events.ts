import { useEffect, useRef } from "react";
import { mutate } from "swr";
import type {
  Event,
  PermissionRequest,
  QuestionRequest,
  Session,
  SessionStatus,
  SessionMessage,
  SessionMessageAssistant,
  SessionMessageAssistantReasoning,
  SessionMessageAssistantText,
  SessionMessageAssistantTool,
  Message,
  Part,
  ToolPart,
  TextPart,
  ReasoningPart,
} from "@opencode-ai/sdk/v2";
import {
  clearMessageQueued,
  getMessagesKey,
  recordCompletedMessage,
  sortSessionMessages,
} from "@/hooks/use-session-messages";
import { backendBasePath, type BackendProvider } from "@/lib/backend-url";

type RuntimeEvent =
  | Event
  | {
      id: string;
      type: "server.heartbeat" | "portal.event.error";
      properties: Record<string, unknown>;
    };

function sessionsKey(port: number, provider?: BackendProvider) {
  return `${backendBasePath(provider, port)}/sessions`;
}

function permissionsKey(port: number, provider?: BackendProvider) {
  return `${backendBasePath(provider, port)}/permissions`;
}

function questionsKey(port: number, provider?: BackendProvider) {
  return `${backendBasePath(provider, port)}/questions`;
}

function gitDiffKey(port: number, provider?: BackendProvider) {
  return `${backendBasePath(provider, port)}/git/diff`;
}

function currentProjectKey(port: number, provider?: BackendProvider) {
  return `${backendBasePath(provider, port)}/project/current`;
}

function sessionStatusKey(port: number, provider?: BackendProvider) {
  return `${backendBasePath(provider, port)}/session/status`;
}

function upsertById<T extends { id: string }>(items: T[] | undefined, item: T) {
  const next = [...(items ?? [])];
  const index = next.findIndex((value) => value.id === item.id);
  if (index >= 0) {
    next[index] = item;
  } else {
    next.push(item);
  }
  return next;
}

function removeById<T extends { id: string }>(
  items: T[] | undefined,
  id: string,
) {
  return (items ?? []).filter((item) => item.id !== id);
}

function sortSessions(sessions: Session[]) {
  return [...sessions].sort(
    (a: Session, b: Session) =>
      (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created),
  );
}

function mutateSessions(
  port: number,
  provider: BackendProvider | undefined,
  updater: (items: Session[]) => Session[],
) {
  void mutate<Session[]>(
    sessionsKey(port, provider),
    (current) => updater(current ?? []),
    { revalidate: false },
  );
}

function mutatePermissions(
  port: number,
  provider: BackendProvider | undefined,
  updater: (items: PermissionRequest[]) => PermissionRequest[],
) {
  void mutate<PermissionRequest[]>(
    permissionsKey(port, provider),
    (current) => updater(current ?? []),
    { revalidate: false },
  );
}

function mutateQuestions(
  port: number,
  provider: BackendProvider | undefined,
  updater: (items: QuestionRequest[]) => QuestionRequest[],
) {
  void mutate<QuestionRequest[]>(
    questionsKey(port, provider),
    (current) => updater(current ?? []),
    { revalidate: false },
  );
}

function mutateSessionStatuses(
  port: number,
  provider: BackendProvider | undefined,
  updater: (
    items: Record<string, SessionStatus>,
  ) => Record<string, SessionStatus>,
) {
  void mutate<Record<string, SessionStatus>>(
    sessionStatusKey(port, provider),
    (current) => updater(current ?? {}),
    { revalidate: false },
  );
}

function mutateMessages(
  port: number,
  provider: BackendProvider | undefined,
  sessionID: string,
  updater: (items: SessionMessage[]) => SessionMessage[],
) {
  void mutate<SessionMessage[]>(
    getMessagesKey(port, sessionID, provider),
    (current) => updater(current ?? []),
    { revalidate: false },
  );
}

function revalidateMessages(
  port: number,
  provider: BackendProvider | undefined,
  sessionID: string,
) {
  void mutate(getMessagesKey(port, sessionID, provider));
}

const messageRevalidationTimers = new Map<
  string,
  ReturnType<typeof setTimeout>
>();

function messageRevalidationKey(
  port: number,
  provider: BackendProvider | undefined,
  sessionID: string,
) {
  return `${provider ?? "opencode"}:${port}:${sessionID}`;
}

function revalidateMessagesSoon(
  port: number,
  provider: BackendProvider | undefined,
  sessionID: string,
) {
  const key = messageRevalidationKey(port, provider, sessionID);
  if (messageRevalidationTimers.has(key)) return;

  const timer = setTimeout(() => {
    messageRevalidationTimers.delete(key);
    revalidateMessages(port, provider, sessionID);
  }, 300);

  messageRevalidationTimers.set(key, timer);
}

function revalidateMessagesNow(
  port: number,
  provider: BackendProvider | undefined,
  sessionID: string,
) {
  const key = messageRevalidationKey(port, provider, sessionID);
  const timer = messageRevalidationTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    messageRevalidationTimers.delete(key);
  }

  revalidateMessages(port, provider, sessionID);
}

function upsertMessage(messages: SessionMessage[], message: SessionMessage) {
  const next = [...messages];
  const index = next.findIndex((item) => item.id === message.id);
  if (index >= 0) {
    next[index] = message;
  } else {
    next.push(message);
  }
  return sortSessionMessages(next);
}

function applyPartDelta(
  messages: SessionMessage[],
  event: Extract<RuntimeEvent, { type: "message.part.delta" }>,
): SessionMessage[] {
  const { messageID, partID, field, delta } = event.properties;
  const index = messages.findIndex((item) => item.id === messageID);
  if (index < 0) return messages;
  const message = messages[index];
  if (message.type !== "assistant") return messages;

  const next = { ...message };
  const content = (next.content ?? []).map((part) => {
    if (part.id !== partID || part.type !== "text") return part;
    if (field !== "text") return part;
    return { ...part, text: part.text + delta };
  });
  if (content === next.content) return messages;

  next.content = content;
  const updated = [...messages];
  updated[index] = next;
  return updated;
}

function toolStateToSessionState(
  state: ToolPart["state"],
): SessionMessageAssistantTool["state"] {
  switch (state.status) {
    case "pending":
      return { status: "pending", input: (state as { raw: string }).raw ?? "" };
    case "running":
      return {
        status: "running",
        input: (state.input ?? {}) as Record<string, unknown>,
        structured: (state.metadata ?? {}) as Record<string, unknown>,
        content: [],
      };
    case "completed": {
      const output =
        typeof state.output === "string" ? state.output : "";
      const attachments = (state as { attachments?: unknown }).attachments as
        | Array<{ url: string; mime: string; filename?: string }>
        | undefined;
      return {
        status: "completed",
        input: (state.input ?? {}) as Record<string, unknown>,
        structured: (state.metadata ?? {}) as Record<string, unknown>,
        content: output ? [{ type: "text", text: output }] : [],
        ...(attachments
          ? {
              attachments: attachments.map((a) => ({
                uri: a.url,
                mime: a.mime,
                ...(a.filename ? { name: a.filename } : {}),
              })),
            }
          : {}),
      };
    }
    case "error":
      return {
        status: "error",
        input: (state.input ?? {}) as Record<string, unknown>,
        structured: (state.metadata ?? {}) as Record<string, unknown>,
        content: [],
        error: { type: "unknown", message: (state as { error: string }).error ?? "" },
      };
    default:
      return { status: "pending", input: "" };
  }
}

function toolPartToSessionTool(
  part: ToolPart,
  fallbackCreated: number,
): SessionMessageAssistantTool {
  const time: SessionMessageAssistantTool["time"] = (() => {
    const s = part.state;
    if (s.status === "pending") return { created: fallbackCreated };
    if (s.status === "running") return { created: s.time.start, ran: s.time.start };
    if (s.status === "completed" || s.status === "error")
      return { created: s.time.start, ran: s.time.start, completed: s.time.end };
    return { created: fallbackCreated };
  })();

  return {
    type: "tool",
    id: part.callID,
    name: part.tool,
    time,
    state: toolStateToSessionState(part.state),
    ...(part.metadata ? { provider: { executed: true, metadata: part.metadata } } : {}),
  };
}

function applyMessagePartUpdated(
  messages: SessionMessage[],
  event: Extract<RuntimeEvent, { type: "message.part.updated" }>,
): SessionMessage[] {
  const part = (event.properties as { part: Part }).part;
  if (!part || typeof part !== "object") return messages;
  const messageID = (part as { messageID?: string }).messageID;
  if (!messageID || typeof messageID !== "string") return messages;
  const idx = messages.findIndex((m) => m.id === messageID);
  if (idx < 0) return messages;
  const msg = messages[idx];
  if (msg.type !== "assistant") return messages;
  const assistant = msg as SessionMessageAssistant;

  if (part.type === "tool") {
    const toolPart = part as ToolPart;
    const sessionTool = toolPartToSessionTool(toolPart, assistant.time.created);
    const existingIdx = assistant.content.findIndex(
      (c) => c.type === "tool" && (c as SessionMessageAssistantTool).id === toolPart.callID,
    );
    let newContent: SessionMessageAssistant["content"];
    if (existingIdx >= 0) {
      newContent = [...assistant.content];
      newContent[existingIdx] = sessionTool;
    } else {
      newContent = [...assistant.content, sessionTool];
    }
    const next: SessionMessageAssistant = { ...assistant, content: newContent };
    const out = [...messages];
    out[idx] = next;
    return out;
  }

  if (part.type === "text") {
    const textPart = part as TextPart;
    const existingIdx = assistant.content.findIndex(
      (c) => c.type === "text" && (c as unknown as { id?: string }).id === textPart.id,
    );
    const sessionText: SessionMessageAssistantText = {
      type: "text",
      text: textPart.text,
    } as SessionMessageAssistantText;
    (sessionText as unknown as { id: string }).id = textPart.id;
    let newContent: SessionMessageAssistant["content"];
    if (existingIdx >= 0) {
      newContent = [...assistant.content];
      newContent[existingIdx] = sessionText;
    } else {
      newContent = [...assistant.content, sessionText];
    }
    const next: SessionMessageAssistant = { ...assistant, content: newContent };
    const out = [...messages];
    out[idx] = next;
    return out;
  }

  if (part.type === "reasoning") {
    const reasoningPart = part as ReasoningPart;
    const existingIdx = assistant.content.findIndex(
      (c) => c.type === "reasoning" && (c as SessionMessageAssistantReasoning).id === reasoningPart.id,
    );
    const sessionReasoning: SessionMessageAssistantReasoning = {
      type: "reasoning",
      id: reasoningPart.id,
      text: reasoningPart.text,
    };
    let newContent: SessionMessageAssistant["content"];
    if (existingIdx >= 0) {
      newContent = [...assistant.content];
      newContent[existingIdx] = sessionReasoning;
    } else {
      newContent = [...assistant.content, sessionReasoning];
    }
    const next: SessionMessageAssistant = { ...assistant, content: newContent };
    const out = [...messages];
    out[idx] = next;
    return out;
  }

  return messages;
}

function applyMessageUpdated(
  messages: SessionMessage[],
  event: Extract<RuntimeEvent, { type: "message.updated" }>,
): SessionMessage[] {
  const info = (event.properties as { info: Message }).info as Message & {
    cost?: number;
    tokens?: SessionMessageAssistant["tokens"];
    time?: { created: number; completed?: number };
    finish?: string;
    error?: unknown;
  };
  if (!info || typeof info !== "object" || !("id" in info)) return messages;
  const idx = messages.findIndex((m) => m.id === (info as { id: string }).id);
  if (idx < 0) return messages;
  const msg = messages[idx];
  if (msg.type !== "assistant") return messages;
  const assistant = msg as SessionMessageAssistant;
  const next: SessionMessageAssistant = { ...assistant };
  const time = (info as { time?: { created?: number; completed?: number } }).time;
  if (time) {
    next.time = {
      created: time.created ?? next.time.created,
      ...(time.completed !== undefined ? { completed: time.completed } : next.time.completed !== undefined ? { completed: next.time.completed } : {}),
    };
  }
  if ("cost" in info && typeof info.cost === "number") next.cost = info.cost;
  if ("tokens" in info && info.tokens) next.tokens = info.tokens as SessionMessageAssistant["tokens"];
  if ("finish" in info && typeof (info as { finish?: string }).finish === "string")
    next.finish = (info as { finish: string }).finish;
  if ("error" in info && (info as { error?: unknown }).error)
    next.error = { type: "unknown", message: String((info as { error: { message?: string } }).error?.message ?? (info as { error: unknown }).error) };
  const out = [...messages];
  out[idx] = next;
  // Only consider updated if something changed
  if (
    next.time === assistant.time &&
    next.cost === assistant.cost &&
    next.tokens === assistant.tokens &&
    next.finish === assistant.finish &&
    next.error === assistant.error
  )
    return messages;
  return out;
}

const partDeltaFallbackTimers = new Map<
  string,
  ReturnType<typeof setTimeout>
>();

function schedulePartDeltaFallback(
  port: number,
  provider: BackendProvider | undefined,
  sessionID: string,
) {
  const key = messageRevalidationKey(port, provider, sessionID);
  if (partDeltaFallbackTimers.has(key)) return;
  const timer = setTimeout(() => {
    partDeltaFallbackTimers.delete(key);
    revalidateMessages(port, provider, sessionID);
  }, 2500);
  partDeltaFallbackTimers.set(key, timer);
}

function upsertPromptedMessage(
  messages: SessionMessage[],
  key: string,
  event: Extract<RuntimeEvent, { type: "session.next.prompted" }>,
): SessionMessage[] {
  const text = event.properties.prompt.text;
  const dequeue = (items: SessionMessage[]) =>
    items.filter(
      (message) =>
        !(
          message.type === "user" &&
          message.text === text &&
          message.metadata?.portalQueued === true
        ),
    );

  clearMessageQueued(key, text);

  return upsertMessage(
    removeMatchingOptimisticUser(dequeue(messages), text),
    {
      id: event.id,
      type: "user",
      text,
      files: event.properties.prompt.files,
      agents: event.properties.prompt.agents,
      time: {
        created: event.properties.timestamp,
      },
    },
  );
}

function replaceMessageAt(
  messages: SessionMessage[],
  index: number,
  message: SessionMessage,
) {
  const next = [...messages];
  next[index] = message;
  return next;
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) return index;
  }
  return -1;
}

function activeAssistantIndex(messages: SessionMessage[]) {
  return findLastIndex(
    messages,
    (message) => message.type === "assistant" && !message.time.completed,
  );
}

function latestToolIndex(assistant: SessionMessageAssistant, callID?: string) {
  return findLastIndex(
    assistant.content,
    (item) =>
      item.type === "tool" && (callID === undefined || item.id === callID),
  );
}

function latestTextIndex(assistant: SessionMessageAssistant) {
  return findLastIndex(assistant.content, (item) => item.type === "text");
}

function latestReasoningIndex(
  assistant: SessionMessageAssistant,
  reasoningID: string,
) {
  return findLastIndex(
    assistant.content,
    (item) => item.type === "reasoning" && item.id === reasoningID,
  );
}

function updateActiveAssistant(
  messages: SessionMessage[],
  updater: (assistant: SessionMessageAssistant) => SessionMessageAssistant,
) {
  const index = activeAssistantIndex(messages);
  if (index < 0) return messages;

  const assistant = messages[index];
  if (assistant.type !== "assistant") return messages;
  return replaceMessageAt(messages, index, updater(assistant));
}

function updateAssistantById(
  messages: SessionMessage[],
  assistantMessageID: string | undefined,
  updater: (assistant: SessionMessageAssistant) => SessionMessageAssistant,
) {
  if (!assistantMessageID) return updateActiveAssistant(messages, updater);
  const idx = messages.findIndex((m) => m.id === assistantMessageID);
  if (idx < 0) return updateActiveAssistant(messages, updater);
  const msg = messages[idx];
  if (msg.type !== "assistant") return messages;
  return replaceMessageAt(messages, idx, updater(msg as SessionMessageAssistant));
}

function updateLatestTool(
  assistant: SessionMessageAssistant,
  callID: string,
  updater: (tool: SessionMessageAssistantTool) => SessionMessageAssistantTool,
) {
  const toolIndex = latestToolIndex(assistant, callID);
  if (toolIndex < 0) return assistant;

  const tool = assistant.content[toolIndex];
  if (tool.type !== "tool") return assistant;

  const content = [...assistant.content];
  content[toolIndex] = updater(tool);
  return { ...assistant, content };
}

function closeActiveAssistant(messages: SessionMessage[], timestamp: number) {
  return updateActiveAssistant(messages, (assistant) => {
    const closed = {
      ...assistant,
      time: {
        ...assistant.time,
        completed: timestamp,
      },
    };
    return closed;
  });
}

function closeActiveAssistantAndRecord(
  messages: SessionMessage[],
  key: string,
  timestamp: number,
) {
  return updateActiveAssistant(messages, (assistant) => {
    recordCompletedMessage(key, assistant.id, timestamp, assistant.finish);
    return {
      ...assistant,
      time: {
        ...assistant.time,
        completed: timestamp,
      },
    };
  });
}

function completeActiveAssistant(
  messages: SessionMessage[],
  key: string,
  timestamp: number,
  updater: (
    assistant: SessionMessageAssistant,
  ) => SessionMessageAssistant,
) {
  const index = activeAssistantIndex(messages);
  if (index < 0) return messages;
  const assistant = messages[index];
  if (assistant.type !== "assistant") return messages;

  recordCompletedMessage(key, assistant.id, timestamp, assistant.finish);
  return replaceMessageAt(messages, index, updater(assistant));
}

function appendAssistantContent(
  messages: SessionMessage[],
  item: SessionMessageAssistant["content"][number],
) {
  return updateActiveAssistant(messages, (assistant) => ({
    ...assistant,
    content: [...assistant.content, item],
  }));
}

function appendAssistantContentById(
  messages: SessionMessage[],
  assistantMessageID: string | undefined,
  item: SessionMessageAssistant["content"][number],
) {
  return updateAssistantById(messages, assistantMessageID, (assistant) => ({
    ...assistant,
    content: [...assistant.content, item],
  }));
}

function completeAssistantById(
  messages: SessionMessage[],
  key: string,
  assistantMessageID: string | undefined,
  timestamp: number,
  updater: (assistant: SessionMessageAssistant) => SessionMessageAssistant,
) {
  if (!assistantMessageID) return completeActiveAssistant(messages, key, timestamp, updater);
  const idx = messages.findIndex((m) => m.id === assistantMessageID);
  if (idx < 0) return completeActiveAssistant(messages, key, timestamp, updater);
  const assistant = messages[idx];
  if (assistant.type !== "assistant") return messages;
  recordCompletedMessage(key, assistant.id, timestamp, assistant.finish);
  return replaceMessageAt(messages, idx, updater(assistant as SessionMessageAssistant));
}

function removeMatchingOptimisticUser(
  messages: SessionMessage[],
  text: string,
) {
  return messages.filter(
    (message) =>
      !(
        message.type === "user" &&
        message.text === text &&
        message.metadata?.portalOptimistic === true
      ),
  );
}

function revalidateInstance(port: number, provider?: BackendProvider) {
  void mutate(sessionsKey(port, provider));
  void mutate(sessionStatusKey(port, provider));
  void mutate(permissionsKey(port, provider));
  void mutate(questionsKey(port, provider));
  const basePath = backendBasePath(provider, port);
  void mutate(
    (key) =>
      typeof key === "string" &&
      key.startsWith(`${basePath}/session/`) &&
      key.endsWith("/messages"),
  );
}

function applyEvent(
  port: number,
  provider: BackendProvider | undefined,
  event: RuntimeEvent,
) {
  switch (event.type) {
    case "server.connected":
      revalidateInstance(port, provider);
      break;

    case "server.heartbeat":
    case "portal.event.error":
      break;

    case "session.created":
    case "session.updated":
      mutateSessions(port, provider, (items) =>
        sortSessions(upsertById(items, event.properties.info)),
      );
      break;

    case "session.deleted":
      mutateSessions(port, provider, (items) =>
        removeById(items, event.properties.sessionID),
      );
      mutateSessionStatuses(port, provider, (items) => {
        const next = { ...items };
        delete next[event.properties.sessionID];
        return next;
      });
      break;

    case "session.status":
      mutateSessionStatuses(port, provider, (items) => ({
        ...items,
        [event.properties.sessionID]: event.properties.status,
      }));
      break;

    case "session.idle":
      mutateSessionStatuses(port, provider, (items) => ({
        ...items,
        [event.properties.sessionID]: { type: "idle" },
      }));
      revalidateMessagesNow(port, provider, event.properties.sessionID);
      break;

    case "session.next.agent.switched":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        upsertMessage(items, {
          id: event.id,
          type: "agent-switched",
          agent: event.properties.agent,
          time: {
            created: event.properties.timestamp,
          },
        }),
      );
      break;

    case "session.next.model.switched":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        upsertMessage(items, {
          id: event.id,
          type: "model-switched",
          model: event.properties.model,
          time: {
            created: event.properties.timestamp,
          },
        }),
      );
      break;

    case "session.next.prompted":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        upsertPromptedMessage(
          items,
          getMessagesKey(port, event.properties.sessionID, provider),
          event,
        ),
      );
      break;

    case "session.next.synthetic":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        upsertMessage(items, {
          id: event.id,
          type: "synthetic",
          sessionID: event.properties.sessionID,
          text: event.properties.text,
          time: {
            created: event.properties.timestamp,
          },
        }),
      );
      break;

    case "session.next.shell.started":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        upsertMessage(items, {
          id: event.id,
          type: "shell",
          callID: event.properties.callID,
          command: event.properties.command,
          output: "",
          time: {
            created: event.properties.timestamp,
          },
        }),
      );
      break;

    case "session.next.shell.ended":
      mutateMessages(port, provider, event.properties.sessionID, (items) => {
        const index = findLastIndex(
          items,
          (item) =>
            item.type === "shell" && item.callID === event.properties.callID,
        );
        if (index < 0) return items;

        const shell = items[index];
        if (shell.type !== "shell") return items;
        return replaceMessageAt(items, index, {
          ...shell,
          output: event.properties.output,
          time: {
            ...shell.time,
            completed: event.properties.timestamp,
          },
        });
      });
      break;

    case "session.next.step.started": {
      const stepStartedKey = getMessagesKey(
        port,
        event.properties.sessionID,
        provider,
      );
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        upsertMessage(
          closeActiveAssistantAndRecord(
            items,
            stepStartedKey,
            event.properties.timestamp,
          ),
          {
            id: (event.properties as { assistantMessageID?: string }).assistantMessageID ?? event.id,
            type: "assistant",
            agent: event.properties.agent,
            model: event.properties.model,
            content: [],
            time: {
              created: event.properties.timestamp,
            },
            ...(event.properties.snapshot
              ? { snapshot: { start: event.properties.snapshot } }
              : {}),
          },
        ),
      );
      break;
    }

    case "session.next.step.ended":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        completeAssistantById(
          items,
          getMessagesKey(port, event.properties.sessionID, provider),
          (event.properties as { assistantMessageID?: string }).assistantMessageID,
          event.properties.timestamp,
          (assistant) => ({
            ...assistant,
            finish: event.properties.finish,
            cost: event.properties.cost,
            tokens: event.properties.tokens,
            time: {
              ...assistant.time,
              completed: event.properties.timestamp,
            },
            ...(event.properties.snapshot
              ? {
                  snapshot: {
                    ...(assistant.snapshot ?? {}),
                    end: event.properties.snapshot,
                  },
                }
              : {}),
          }),
        ),
      );
      break;

    case "session.next.step.failed":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        completeAssistantById(
          items,
          getMessagesKey(port, event.properties.sessionID, provider),
          (event.properties as { assistantMessageID?: string }).assistantMessageID,
          event.properties.timestamp,
          (assistant) => ({
            ...assistant,
            finish: "error",
            error: event.properties.error,
            time: {
              ...assistant.time,
              completed: event.properties.timestamp,
            },
          }),
        ),
      );
      break;

    case "session.next.text.started":
      mutateMessages(port, provider, event.properties.sessionID, (items) => {
        const item = {
          type: "text",
          text: "",
        } as unknown as SessionMessageAssistantText;
        (item as unknown as { id: string }).id =
          (event.properties as { textID?: string }).textID ?? `text-${event.id}`;
        return appendAssistantContentById(
          items,
          (event.properties as { assistantMessageID?: string }).assistantMessageID,
          item,
        );
      });
      break;

    case "session.next.text.delta":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        updateAssistantById(
          items,
          (event.properties as { assistantMessageID?: string }).assistantMessageID,
          (assistant) => {
            const textIndex = latestTextIndex(assistant);
            if (textIndex < 0) return assistant;

            const text = assistant.content[textIndex];
            if (text.type !== "text") return assistant;

            const content = [...assistant.content];
            content[textIndex] = {
              ...text,
              text: `${text.text}${event.properties.delta}`,
            } satisfies SessionMessageAssistantText;
            return { ...assistant, content };
          },
        ),
      );
      break;

    case "session.next.text.ended":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        updateAssistantById(
          items,
          (event.properties as { assistantMessageID?: string }).assistantMessageID,
          (assistant) => {
            const textIndex = latestTextIndex(assistant);
            if (textIndex < 0) return assistant;

            const text = assistant.content[textIndex];
            if (text.type !== "text") return assistant;

            const content = [...assistant.content];
            content[textIndex] = {
              ...text,
              text: event.properties.text,
            } satisfies SessionMessageAssistantText;
            return { ...assistant, content };
          },
        ),
      );
      break;

    case "session.next.reasoning.started":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        appendAssistantContentById(
          items,
          (event.properties as { assistantMessageID?: string }).assistantMessageID,
          {
            type: "reasoning",
            id: event.properties.reasoningID,
            text: "",
          },
        ),
      );
      break;

    case "session.next.reasoning.delta":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        updateAssistantById(
          items,
          (event.properties as { assistantMessageID?: string }).assistantMessageID,
          (assistant) => {
            const reasoningIndex = latestReasoningIndex(
              assistant,
              event.properties.reasoningID,
            );
            if (reasoningIndex < 0) return assistant;

            const reasoning = assistant.content[reasoningIndex];
            if (reasoning.type !== "reasoning") return assistant;

            const content = [...assistant.content];
            content[reasoningIndex] = {
              ...reasoning,
              text: `${reasoning.text}${event.properties.delta}`,
            } satisfies SessionMessageAssistantReasoning;
            return { ...assistant, content };
          },
        ),
      );
      break;

    case "session.next.reasoning.ended":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        updateAssistantById(
          items,
          (event.properties as { assistantMessageID?: string }).assistantMessageID,
          (assistant) => {
            const reasoningIndex = latestReasoningIndex(
              assistant,
              event.properties.reasoningID,
            );
            if (reasoningIndex < 0) return assistant;

            const reasoning = assistant.content[reasoningIndex];
            if (reasoning.type !== "reasoning") return assistant;

            const content = [...assistant.content];
            content[reasoningIndex] = {
              ...reasoning,
              text: event.properties.text,
            } satisfies SessionMessageAssistantReasoning;
            return { ...assistant, content };
          },
        ),
      );
      break;

    case "session.next.tool.input.started":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        appendAssistantContentById(
          items,
          (event.properties as { assistantMessageID?: string }).assistantMessageID,
          {
            type: "tool",
            id: event.properties.callID,
            name: event.properties.name,
            time: {
              created: event.properties.timestamp,
            },
            state: {
              status: "pending",
              input: "",
            },
          },
        ),
      );
      break;

    case "session.next.tool.input.delta":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        updateAssistantById(
          items,
          (event.properties as { assistantMessageID?: string }).assistantMessageID,
          (assistant) =>
            updateLatestTool(assistant, event.properties.callID, (tool) => {
              if (tool.state.status !== "pending") return tool;
              return {
                ...tool,
                state: {
                  ...tool.state,
                  input: `${tool.state.input}${event.properties.delta}`,
                },
              };
            }),
        ),
      );
      break;

    case "session.next.tool.input.ended":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        updateAssistantById(
          items,
          (event.properties as { assistantMessageID?: string }).assistantMessageID,
          (assistant) =>
            updateLatestTool(assistant, event.properties.callID, (tool) => {
              if (tool.state.status !== "pending") return tool;
              return {
                ...tool,
                state: {
                  ...tool.state,
                  input: event.properties.text,
                },
              };
            }),
        ),
      );
      break;

    case "session.next.tool.called":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        updateAssistantById(
          items,
          (event.properties as { assistantMessageID?: string }).assistantMessageID,
          (assistant) =>
            updateLatestTool(assistant, event.properties.callID, (tool) => ({
              ...tool,
              name: event.properties.tool,
              provider: event.properties.provider,
              time: {
                ...tool.time,
                ran: event.properties.timestamp,
              },
              state: {
                status: "running",
                input: event.properties.input,
                structured: {},
                content: [],
              },
            })),
        ),
      );
      break;

    case "session.next.tool.progress":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        updateAssistantById(
          items,
          (event.properties as { assistantMessageID?: string }).assistantMessageID,
          (assistant) =>
            updateLatestTool(assistant, event.properties.callID, (tool) => {
              if (tool.state.status !== "running") return tool;
              return {
                ...tool,
                state: {
                  ...tool.state,
                  structured: event.properties.structured,
                  content: [...event.properties.content],
                },
              };
            }),
        ),
      );
      break;

    case "session.next.tool.success":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        updateAssistantById(
          items,
          (event.properties as { assistantMessageID?: string }).assistantMessageID,
          (assistant) =>
            updateLatestTool(assistant, event.properties.callID, (tool) => {
              const input =
                tool.state.status === "running" ||
                tool.state.status === "completed"
                  ? tool.state.input
                  : {};
              return {
                ...tool,
                provider: event.properties.provider,
                time: {
                  ...tool.time,
                  completed: event.properties.timestamp,
                },
                state: {
                  status: "completed",
                  input,
                  structured: event.properties.structured,
                  content: [...event.properties.content],
                },
              };
            }),
        ),
      );
      break;

    case "session.next.tool.failed":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        updateAssistantById(
          items,
          (event.properties as { assistantMessageID?: string }).assistantMessageID,
          (assistant) =>
            updateLatestTool(assistant, event.properties.callID, (tool) => {
              const input =
                tool.state.status === "running" ||
                tool.state.status === "completed"
                  ? tool.state.input
                  : {};
              const structured =
                tool.state.status === "running" ||
                tool.state.status === "completed" ||
                tool.state.status === "error"
                  ? tool.state.structured
                  : {};
              const content =
                tool.state.status === "running" ||
                tool.state.status === "completed" ||
                tool.state.status === "error"
                  ? tool.state.content
                  : [];
              return {
                ...tool,
                provider: event.properties.provider,
                time: {
                  ...tool.time,
                  completed: event.properties.timestamp,
                },
                state: {
                  status: "error",
                  input,
                  structured,
                  content,
                  error: event.properties.error,
                },
              };
            }),
        ),
      );
      break;

    case "session.next.retried":
      revalidateMessages(port, provider, event.properties.sessionID);
      break;

    case "session.next.compaction.started":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        upsertMessage(items, {
          id: event.id,
          type: "compaction",
          reason: event.properties.reason,
          summary: "",
          time: {
            created: event.properties.timestamp,
          },
        }),
      );
      break;

    case "session.next.compaction.delta":
      mutateMessages(port, provider, event.properties.sessionID, (items) => {
        const index = findLastIndex(
          items,
          (item) => item.type === "compaction",
        );
        if (index < 0) return items;

        const compaction = items[index];
        if (compaction.type !== "compaction") return items;
        return replaceMessageAt(items, index, {
          ...compaction,
          summary: `${compaction.summary}${event.properties.text}`,
        });
      });
      break;

    case "session.next.compaction.ended":
      mutateMessages(port, provider, event.properties.sessionID, (items) => {
        const index = findLastIndex(
          items,
          (item) => item.type === "compaction",
        );
        if (index < 0) return items;

        const compaction = items[index];
        if (compaction.type !== "compaction") return items;
        return replaceMessageAt(items, index, {
          ...compaction,
          summary: event.properties.text,
          ...(event.properties.include
            ? { include: event.properties.include }
            : {}),
        });
      });
      break;

    case "message.updated": {
      let handled = false;
      mutateMessages(port, provider, event.properties.sessionID, (items) => {
        const next = applyMessageUpdated(items, event as Extract<RuntimeEvent, { type: "message.updated" }>);
        if (next !== items) handled = true;
        return next;
      });
      if (!handled) revalidateMessagesNow(port, provider, event.properties.sessionID);
      break;
    }
    case "message.part.updated": {
      let handled = false;
      mutateMessages(port, provider, event.properties.sessionID, (items) => {
        const next = applyMessagePartUpdated(items, event as Extract<RuntimeEvent, { type: "message.part.updated" }>);
        if (next !== items) handled = true;
        return next;
      });
      if (!handled) revalidateMessagesNow(port, provider, event.properties.sessionID);
      break;
    }

    case "message.part.delta": {
      let applied = false;
      mutateMessages(
        port,
        provider,
        event.properties.sessionID,
        (items) => {
          const next = applyPartDelta(items, event);
          if (next !== items) applied = true;
          return next;
        },
      );
      if (!applied) {
        schedulePartDeltaFallback(port, provider, event.properties.sessionID);
      }
      break;
    }

    case "message.removed":
    case "message.part.removed":
      revalidateMessagesNow(port, provider, event.properties.sessionID);
      break;

    case "session.compacted":
      revalidateMessages(port, provider, event.properties.sessionID);
      break;

    case "session.error":
      if (event.properties.sessionID) {
        revalidateMessagesNow(port, provider, event.properties.sessionID);
        void mutate(sessionStatusKey(port, provider));
      }
      break;

    case "permission.asked":
      mutatePermissions(port, provider, (items) =>
        upsertById(items, event.properties),
      );
      break;

    case "permission.replied":
      mutatePermissions(port, provider, (items) =>
        removeById(items, event.properties.requestID),
      );
      break;

    case "question.asked":
      mutateQuestions(port, provider, (items) =>
        upsertById(items, event.properties),
      );
      break;

    case "question.replied":
    case "question.rejected":
      mutateQuestions(port, provider, (items) =>
        removeById(items, event.properties.requestID),
      );
      break;

    case "session.diff":
    case "vcs.branch.updated":
      void mutate(gitDiffKey(port, provider));
      break;

    case "project.updated":
      void mutate(currentProjectKey(port, provider));
      break;
  }
}

function parseEvent(data: string): RuntimeEvent | null {
  try {
    return JSON.parse(data) as RuntimeEvent;
  } catch {
    return null;
  }
}

export function useOpencodeEvents(
  port: number | null | undefined,
  provider?: BackendProvider,
) {
  const queueRef = useRef<RuntimeEvent[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!port) return;

    const flush = () => {
      timerRef.current = null;
      const events = queueRef.current;
      queueRef.current = [];
      for (const event of events) {
        applyEvent(port, provider, event);
      }
    };

    const enqueue = (event: RuntimeEvent) => {
      queueRef.current.push(event);
      if (timerRef.current !== null) return;
      timerRef.current = window.setTimeout(flush, 80);
    };

    const source = new EventSource(`${backendBasePath(provider, port)}/events`);

    source.onmessage = (message) => {
      const event = parseEvent(message.data);
      if (event) enqueue(event);
    };

    return () => {
      source.close();
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      queueRef.current = [];
    };
  }, [port, provider]);
}
