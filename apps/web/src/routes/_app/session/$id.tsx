import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback, useMemo, memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Ripples } from "ldrs/react";
import "ldrs/react/Ripples.css";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader } from "@/components/ui/loader";
import { AgentSelect } from "@/components/agent-select";
import { ModelSelect } from "@/components/model-select";
import {
  FileMentionPopover,
  useFileMention,
} from "@/components/file-mention-popover";
import { CommandPopover } from "@/components/command-popover";
import { McpDialog } from "@/components/mcp-dialog";
import { StatusDialog } from "@/components/status-dialog";
import { useSlashCommand } from "@/hooks/use-slash-command";
import { useCommands } from "@/hooks/use-commands";
import useMediaQuery from "@/hooks/use-media-query";
import {
  ChevronDownIcon,
  IconBadgeSparkle,
  IconEye,
  IconMagnifier,
  IconPen,
  IconSquareFeather,
  IconUser,
  InformationCircleIcon,
  ListPlusIcon,
  PaperclipIcon,
  SendIcon,
  Undo2Icon,
  XMarkIcon,
} from "@/components/icons/lucide";
import { useAgentStore } from "@/stores/agent-store";
import { useInstanceStore } from "@/stores/instance-store";
import { useModelStore } from "@/stores/model-store";
import { useBreadcrumb } from "@/contexts/breadcrumb-context";
import {
  useSessionMessages,
  addOptimisticMessage,
  reconcileOptimisticMessage,
  settleOptimisticMessage,
  removeOptimisticMessage,
  mutateSessionMessages,
  type MessageWithParts,
  type Part,
  type ToolPart,
  type PermissionRequest,
  type QuestionAnswer,
  type QuestionInfo,
  type QuestionRequest,
} from "@/hooks/use-session-messages";
import {
  useAgents,
  usePermissions,
  useQuestions,
  useSessionStatuses,
  useSessions,
} from "@/hooks/use-opencode";
import {
  getDefaultUserSelectableAgentName,
  isValidUserSelectableAgent,
} from "@/lib/agent-selection";
import { getErrorMessage, getResponseErrorMessage } from "@/lib/error-message";
import { backendBasePath, type BackendProvider } from "@/lib/backend-url";
import type { Agent, Session, SessionMessage } from "@opencode-ai/sdk/v2";

export const Route = createFileRoute("/_app/session/$id")({
  component: SessionPage,
});

type PermissionReply = "once" | "always" | "reject";

interface PromptSendResponse {
  accepted: boolean;
  duplicate?: boolean;
  mode?: "v2" | "legacy";
  message?: SessionMessage;
  messageID?: string;
}

interface Attachment {
  id: string;
  name: string;
  mime: string;
  url: string;
  size: number;
}

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const ACCEPTED_ATTACHMENT_MIMES =
  "image/*,application/pdf,text/plain,text/markdown,text/csv,application/json";

function isAcceptedAttachmentMime(mime: string) {
  if (mime.startsWith("image/")) return true;
  return [
    "application/pdf",
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/json",
  ].includes(mime);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function isValidSessionAgent(agents: Agent[], name?: string) {
  return isValidUserSelectableAgent(agents, name);
}

function getDefaultSessionAgentName(agents: Agent[]) {
  return getDefaultUserSelectableAgentName(agents);
}

const OPENCODE_ID_LENGTH = 26;
let lastMessageIdTimestamp = 0;
let messageIdCounter = 0;

function getRandomBytes(length: number) {
  const bytes = new Uint8Array(length);
  const cryptoObj =
    typeof globalThis !== "undefined" ? globalThis.crypto : undefined;

  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    cryptoObj.getRandomValues(bytes);
    return bytes;
  }

  for (let i = 0; i < length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }

  return bytes;
}

function randomBase62(length: number) {
  const chars =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const bytes = getRandomBytes(length);
  let result = "";

  for (let i = 0; i < length; i += 1) {
    result += chars[bytes[i] % chars.length];
  }

  return result;
}

function createClientMessageId() {
  const currentTimestamp = Date.now();

  if (currentTimestamp !== lastMessageIdTimestamp) {
    lastMessageIdTimestamp = currentTimestamp;
    messageIdCounter = 0;
  }

  messageIdCounter += 1;

  const encoded =
    BigInt(currentTimestamp) * BigInt(0x1000) + BigInt(messageIdCounter);
  const timeBytes = new Uint8Array(6);

  for (let i = 0; i < timeBytes.length; i += 1) {
    timeBytes[i] = Number((encoded >> BigInt(40 - 8 * i)) & BigInt(0xff));
  }

  const timeHex = Array.from(timeBytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `msg_${timeHex}${randomBase62(OPENCODE_ID_LENGTH - timeHex.length)}`;
}

function isToolPart(part: Part): part is ToolPart {
  return part.type === "tool";
}

function parseToolQuestions(part: ToolPart): QuestionInfo[] {
  const input = (part.state?.input || {}) as Record<string, unknown>;
  const rawQuestions = input.questions;

  if (!Array.isArray(rawQuestions)) {
    return [];
  }

  return rawQuestions
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    )
    .map((item) => ({
      question: String(item.question || ""),
      header: String(item.header || ""),
      options: Array.isArray(item.options)
        ? item.options
            .filter(
              (opt): opt is Record<string, unknown> =>
                typeof opt === "object" && opt !== null,
            )
            .map((opt) => ({
              label: String(opt.label || ""),
              description: String(opt.description || ""),
            }))
            .filter((opt) => !!opt.label)
        : [],
      multiple: Boolean(item.multiple),
      custom: item.custom !== false,
    }))
    .filter((q) => !!q.question);
}

function formatToolCall(part: ToolPart): {
  icon: React.ReactNode;
  label: string;
  details?: string;
} {
  const toolName = part.tool?.toLowerCase() || "";
  const input = (part.state?.input || {}) as Record<string, unknown>;

  switch (toolName) {
    case "edit": {
      const filePath = input.filePath || input.file || "";
      const oldStr = String(input.oldString || "");
      const newStr = String(input.newString || "");
      const additions = newStr.split("\n").length;
      const deletions = oldStr.split("\n").length;
      return {
        icon: <IconPen size="12px" />,
        label: `edit ${filePath}`,
        details: `(+${additions}-${deletions})`,
      };
    }
    case "read": {
      const filePath = input.filePath || input.file || "";
      return {
        icon: <IconEye size="12px" />,
        label: `read ${filePath}`,
      };
    }
    case "write": {
      const filePath = input.filePath || input.file || "";
      const content = String(input.content || "");
      const lines = content.split("\n").length;
      return {
        icon: <IconSquareFeather size="12px" />,
        label: `write ${filePath}`,
        details: `(${lines} lines)`,
      };
    }
    case "bash": {
      const command = String(input.command || input.cmd || "");
      const shortCmd = command.split("\n")[0]?.slice(0, 50) || "";
      return {
        icon: "$",
        label: `bash ${shortCmd}${command.length > 50 ? "..." : ""}`,
        details: input.description ? `# ${input.description}` : undefined,
      };
    }
    case "glob": {
      const pattern = input?.pattern || "";
      const path = input?.path || "";
      return {
        icon: <IconMagnifier size="12px" />,
        label: `glob ${pattern}`,
        details: path ? `in ${path}` : undefined,
      };
    }
    case "grep": {
      const pattern = input.pattern || "";
      const path = input.path || "";
      return {
        icon: "◼︎",
        label: `grep "${pattern}"`,
        details: path ? `in ${path}` : undefined,
      };
    }
    default: {
      const firstArg = Object.entries(input)[0];
      return {
        icon: "◼︎",
        label: toolName || "unknown",
        details: firstArg
          ? `${firstArg[0]}: ${String(firstArg[1]).slice(0, 30)}...`
          : undefined,
      };
    }
  }
}

function formatToolArgs(
  input: Record<string, unknown>,
  omit: string[] = [],
): string {
  const primitives = Object.entries(input).filter(([key, value]) => {
    if (omit.includes(key)) return false;
    return (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    );
  });
  if (primitives.length === 0) return "";
  return `[${primitives
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(", ")}]`;
}

function formatToolInvocation(part: ToolPart): string {
  const toolName = part.tool?.toLowerCase() || "";
  const input = (part.state.input || {}) as Record<string, unknown>;

  switch (toolName) {
    case "bash":
    case "shell":
      return `$ ${String(input.command ?? "")}`.trim();
    case "read": {
      const filePath = input.filePath || input.file || "";
      const args = formatToolArgs(input, ["filePath", "file"]);
      return `Read ${filePath}${args ? ` ${args}` : ""}`.trim();
    }
    case "write":
      return `Write ${String(input.filePath || input.file || "")}`.trim();
    case "edit": {
      const filePath = input.filePath || input.file || "";
      const replaceAll =
        input.replaceAll !== undefined
          ? ` [replaceAll=${String(input.replaceAll)}]`
          : "";
      return `Edit ${filePath}${replaceAll}`.trim();
    }
    case "glob": {
      const pattern = input.pattern || "";
      const path = input.path;
      return `Glob "${pattern}"${path ? ` in ${String(path)}` : ""}`.trim();
    }
    case "grep": {
      const pattern = input.pattern || "";
      const path = input.path;
      return `Grep "${pattern}"${path ? ` in ${String(path)}` : ""}`.trim();
    }
    case "webfetch":
      return `WebFetch ${String(input.url || "")}`.trim();
    case "websearch":
      return `WebSearch "${String(input.query || "")}"`.trim();
    default: {
      const args = formatToolArgs(input);
      return `${part.tool || "tool"}${args ? ` ${args}` : ""}`.trim();
    }
  }
}

function toolMetadata(part: ToolPart): Record<string, unknown> {
  return "metadata" in part.state && part.state.metadata
    ? part.state.metadata
    : {};
}

function parseTodoItems(input: Record<string, unknown>) {
  const raw = input.todos;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;
    const status = typeof record.status === "string" ? record.status : undefined;
    const content =
      typeof record.content === "string" ? record.content : undefined;
    return status && content ? [{ status, content }] : [];
  });
}

function parseApplyPatchFiles(part: ToolPart) {
  const files = toolMetadata(part).files;
  if (!Array.isArray(files)) return [];
  return files.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;
    const type = typeof record.type === "string" ? record.type : undefined;
    const relativePath =
      typeof record.relativePath === "string"
        ? record.relativePath
        : undefined;
    const patch = typeof record.patch === "string" ? record.patch : undefined;
    const movePath =
      typeof record.movePath === "string" ? record.movePath : undefined;
    return type && relativePath && patch !== undefined
      ? [{ type, relativePath, patch, movePath }]
      : [];
  });
}

function toolExpandedLines(part: ToolPart): string[] {
  const toolName = part.tool?.toLowerCase() || "";
  const input = (part.state.input || {}) as Record<string, unknown>;
  const metadata = toolMetadata(part);
  const output =
    part.state.status === "completed" ? part.state.output : undefined;
  const error = part.state.status === "error" ? part.state.error : undefined;
  const lines: string[] = [];
  let skipOutput = false;

  switch (toolName) {
    case "todowrite": {
      const todos = parseTodoItems(input);
      if (todos.length > 0) {
        lines.push(
          "Todos",
          ...todos.map((todo) => {
            const mark =
              todo.status === "completed"
                ? "✓"
                : todo.status === "in_progress"
                  ? "•"
                  : " ";
            return `[${mark}] ${todo.content}`;
          }),
        );
        skipOutput = true;
        break;
      }
      lines.push(formatToolInvocation(part));
      break;
    }
    case "apply_patch": {
      const files = parseApplyPatchFiles(part);
      if (files.length > 0) {
        lines.push(
          "Patch",
          ...files.flatMap((file) => {
            const title =
              file.type === "delete"
                ? `Deleted ${file.relativePath}`
                : file.type === "add"
                  ? `Created ${file.relativePath}`
                  : file.type === "move"
                    ? `Moved ${file.movePath ?? file.relativePath} → ${file.relativePath}`
                    : `Patched ${file.relativePath}`;
            return [title, file.patch];
          }),
        );
        skipOutput = true;
        break;
      }
      lines.push("Patch");
      break;
    }
    case "write": {
      lines.push(formatToolInvocation(part));
      const content = input.content;
      if (typeof content === "string" && content.trim()) {
        lines.push(content);
      }
      break;
    }
    case "edit": {
      lines.push(formatToolInvocation(part));
      const diff = metadata.diff;
      if (typeof diff === "string" && diff.trim()) {
        lines.push(diff);
      }
      break;
    }
    case "task": {
      const description = input.description;
      lines.push(
        typeof description === "string" && description.trim()
          ? `Task ${description}`
          : formatToolInvocation(part),
      );
      break;
    }
    case "execute": {
      lines.push("execute");
      const calls = Array.isArray(metadata.toolCalls)
        ? metadata.toolCalls
        : [];
      for (const call of calls) {
        if (typeof call !== "object" || call === null) continue;
        const record = call as Record<string, unknown>;
        const tool = typeof record.tool === "string" ? record.tool : undefined;
        if (!tool) continue;
        const args = formatToolArgs(
          (record.input ?? {}) as Record<string, unknown>,
        );
        lines.push(
          `↳ ${tool}${args ? ` ${args}` : ""}${
            record.status === "error" ? " (failed)" : ""
          }`,
        );
      }
      break;
    }
    case "skill": {
      const name = input.name;
      lines.push(
        typeof name === "string" && name.trim()
          ? `Skill "${name}"`
          : formatToolInvocation(part),
      );
      break;
    }
    default:
      lines.push(formatToolInvocation(part));
  }

  if (!skipOutput && output && output.trim()) {
    lines.push(output);
  }
  if (error && error.trim()) {
    lines.push(error);
  }
  return lines;
}

function QuestionDisplay({
  questions,
  partKey,
}: {
  questions: QuestionInfo[];
  partKey: string;
}) {
  return (
    <>
      {questions.map((q, idx) => (
        <div key={`${partKey}-q-${idx}`} className="space-y-1">
          {(q.header || q.multiple) && (
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-fg">
              {q.header && <span>{q.header}</span>}
              {q.multiple && (
                <span className="rounded border border-warning/50 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                  Multi-select
                </span>
              )}
            </div>
          )}
          <p className="text-xs leading-relaxed">{q.question}</p>

          {q.options.length > 0 && (
            <ul className="space-y-1 ml-3 list-disc text-muted-fg">
              {q.options.map((opt, optIdx) => (
                <li key={`opt-${idx}-${optIdx}`}>
                  <span className="text-fg">{opt.label}</span>
                  {opt.description && (
                    <span className="text-muted-fg"> - {opt.description}</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {(q.multiple || q.custom) && (
            <div className="text-[11px] text-muted-fg">
              {q.multiple && "You can select multiple options"}
              {q.multiple && q.custom && " | "}
              {q.custom && "Custom answer allowed"}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function getMessageContent(parts: Part[]): string {
  return parts
    .filter(
      (part): part is Part & { type: "text"; text: string } =>
        part.type === "text" && "text" in part && !!part.text?.trim(),
    )
    .map((part) => part.text)
    .join("\n\n");
}

function getAssistantError(message: MessageWithParts) {
  return "error" in message.info ? getErrorMessage(message.info.error) : null;
}

function ChatErrorAlert({
  title,
  message,
  className = "",
}: {
  title: string;
  message: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className={`rounded-md border border-danger/20 bg-danger-subtle px-3 py-2 text-danger-subtle-fg ${className}`}
    >
      <div className="flex items-start gap-2">
        <InformationCircleIcon size="14px" className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-medium">{title}</div>
          <div className="mt-0.5 break-words text-xs opacity-90">{message}</div>
        </div>
      </div>
    </div>
  );
}

function QuestionAnswerForm({
  questions,
  partKey,
  port,
  provider,
  sessionId,
  callID,
  pendingQuestions,
  onResolved,
}: {
  questions: QuestionInfo[];
  partKey: string;
  port: number;
  provider?: BackendProvider;
  sessionId: string;
  callID: string;
  pendingQuestions: QuestionRequest[];
  onResolved: (requestId: string) => void;
}) {
  const [selections, setSelections] = useState<Record<number, string[]>>({});
  const [freeformInputs, setFreeformInputs] = useState<Record<number, string>>(
    {},
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const toggleOption = (qIdx: number, label: string, isMulti: boolean) => {
    setSelections((prev) => {
      const current = prev[qIdx] || [];
      if (isMulti) {
        return {
          ...prev,
          [qIdx]: current.includes(label)
            ? current.filter((l) => l !== label)
            : [...current, label],
        };
      }
      return { ...prev, [qIdx]: current.includes(label) ? [] : [label] };
    });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);

    try {
      const apiBase = backendBasePath(provider, port);
      let match =
        pendingQuestions.find((q) => q.tool?.callID === callID) ??
        pendingQuestions.find((q) => q.sessionID === sessionId);

      if (!match) {
        const listRes = await fetch(`${apiBase}/questions`);
        if (!listRes.ok) throw new Error("Failed to fetch pending questions");
        const latestQuestions = (await listRes.json()) as QuestionRequest[];
        match =
          latestQuestions.find((q) => q.tool?.callID === callID) ??
          latestQuestions.find((q) => q.sessionID === sessionId);
      }

      if (!match) {
        throw new Error(
          "Question request not found - it may have already been answered",
        );
      }

      // Build answers array: one string[] per question
      const answers: QuestionAnswer[] = questions.map((_, i) => {
        const selected = selections[i] || [];
        const freeform = freeformInputs[i]?.trim() || "";
        if (selected.length > 0) return selected;
        if (freeform) return [freeform];
        return [];
      });

      const replyRes = await fetch(`${apiBase}/question/${match.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });

      if (!replyRes.ok) throw new Error("Failed to submit answers");

      onResolved(match.id);
      mutateSessionMessages(port, sessionId, provider);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to submit answers",
      );
      setSubmitting(false);
    }
  };

  const hasAnswersForAllQuestions =
    questions.length > 0 &&
    questions.every((_, i) => {
      const selected = selections[i] || [];
      const freeform = freeformInputs[i]?.trim() || "";
      return selected.length > 0 || freeform.length > 0;
    });

  return (
    <div className="mt-2 space-y-3 text-fg/90">
      {questions.map((q, idx) => {
        const selected = selections[idx] || [];

        return (
          <div key={`${partKey}-q-${idx}`} className="space-y-1.5">
            {(q.header || q.multiple) && (
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-fg">
                {q.header && <span>{q.header}</span>}
                {q.multiple && (
                  <span className="rounded border border-warning/50 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                    Multi-select
                  </span>
                )}
              </div>
            )}
            <p className="text-xs leading-relaxed">{q.question}</p>

            {q.options.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {q.options.map((opt, optIdx) => {
                  const isSelected = selected.includes(opt.label);
                  return (
                    <button
                      key={`opt-${idx}-${optIdx}`}
                      type="button"
                      disabled={submitting}
                      onClick={() => toggleOption(idx, opt.label, !!q.multiple)}
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-bg hover:border-fg/30 text-fg/80"
                      } ${submitting ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <span>{opt.label}</span>
                      {opt.description && (
                        <span className="opacity-60"> - {opt.description}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {(q.options.length === 0 || q.custom) && (
              <input
                type="text"
                disabled={submitting}
                placeholder="Type your answer..."
                value={freeformInputs[idx] || ""}
                onChange={(e) =>
                  setFreeformInputs((prev) => ({
                    ...prev,
                    [idx]: e.target.value,
                  }))
                }
                className="w-full rounded-md border border-border bg-bg px-2 py-1 text-xs text-fg placeholder:text-muted-fg focus:outline-none focus:border-primary"
              />
            )}

            {q.multiple && (
              <div className="text-[11px] text-warning/90">
                You can select more than one option
              </div>
            )}
          </div>
        );
      })}

      {submitError && (
        <div className="text-[11px] text-danger">{submitError}</div>
      )}

      <Button
        type="button"
        size="sm"
        isDisabled={!hasAnswersForAllQuestions || submitting}
        onPress={handleSubmit}
        className="mt-1"
      >
        <SendIcon size="12px" />
        {submitting ? "Sending..." : "Submit Answers"}
      </Button>
    </div>
  );
}

function PermissionRequestForm({
  permission,
  port,
  provider,
  onResolved,
}: {
  permission: PermissionRequest;
  port: number;
  provider?: BackendProvider;
  onResolved: (requestId: string) => void;
}) {
  const [submitting, setSubmitting] = useState<PermissionReply | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleReply = async (reply: PermissionReply) => {
    setSubmitting(reply);
    setSubmitError(null);

    try {
      const apiBase = backendBasePath(provider, port);
      const response = await fetch(
        `${apiBase}/permission/${permission.id}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reply }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to reply to permission request");
      }

      onResolved(permission.id);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to reply to permission",
      );
      setSubmitting(null);
    }
  };

  const firstPattern = permission.patterns[0];

  return (
    <div className="mt-2 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-xs space-y-2">
      <div className="font-medium text-warning">Permission required</div>
      <div className="text-fg/90">
        Tool requests <span className="font-mono">{permission.permission}</span>
      </div>
      {firstPattern && (
        <div className="text-muted-fg break-all">
          Path: <span className="font-mono">{firstPattern}</span>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <Button
          type="button"
          size="sm"
          isDisabled={!!submitting}
          onPress={() => handleReply("once")}
        >
          {submitting === "once" ? "Allowing..." : "Allow once"}
        </Button>
        <Button
          type="button"
          size="sm"
          isDisabled={!!submitting}
          onPress={() => handleReply("always")}
          className="bg-success/20 text-success hover:bg-success/25"
        >
          {submitting === "always" ? "Saving..." : "Allow always"}
        </Button>
        <Button
          type="button"
          size="sm"
          isDisabled={!!submitting}
          onPress={() => handleReply("reject")}
          className="bg-danger/20 text-danger hover:bg-danger/25"
        >
          {submitting === "reject" ? "Rejecting..." : "Reject"}
        </Button>
      </div>
      {submitError && <div className="text-danger">{submitError}</div>}
    </div>
  );
}

const toolCardLines = new WeakMap<HTMLElement, () => string>();

const ToolCallItem = memo(function ToolCallItem({
  part,
  port,
  provider,
  sessionId,
  pendingQuestions,
  onQuestionResolved,
}: {
  part: ToolPart;
  port: number;
  provider?: BackendProvider;
  sessionId: string;
  pendingQuestions: QuestionRequest[];
  onQuestionResolved: (requestId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const pointerDownRef = useRef<{
    x: number;
    y: number;
    hadSelection: boolean;
  } | null>(null);
  const clickTimerRef = useRef<number | null>(null);
  const { icon, label, details } = formatToolCall(part);
  const isQuestionTool = (part.tool || "").toLowerCase() === "question";
  const questions = isQuestionTool ? parseToolQuestions(part) : [];
  const hasQuestions = questions.length > 0;
  const isCompleted = part.state.status === "completed";
  const isError = part.state.status === "error";
  const isPending =
    part.state.status === "pending" || part.state.status === "running";
  const input = part.state.input as Record<string, unknown> | undefined;
  const hasInput = !!input && Object.keys(input).length > 0;
  const output =
    part.state.status === "completed" ? part.state.output : undefined;
  const error = part.state.status === "error" ? part.state.error : undefined;
  const canExpand = hasInput || !!output || !!error;

  const toggleImmediately = () => {
    setExpanded((value) => !value);
  };

  const toggleExpanded = (
    event?: React.MouseEvent | React.KeyboardEvent,
  ) => {
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      return;
    }
    if (window.getSelection()?.toString()) return;
    if (event && "detail" in event && event.detail > 1) return;
    if (
      pointerDownRef.current &&
      event &&
      "clientX" in event &&
      "clientY" in event
    ) {
      if (pointerDownRef.current.hadSelection) return;
      const dx = event.clientX - pointerDownRef.current.x;
      const dy = event.clientY - pointerDownRef.current.y;
      if (Math.hypot(dx, dy) > 4) return;
    }
    pointerDownRef.current = null;
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      setExpanded((value) => !value);
    }, 250);
  };

  useEffect(
    () => () => {
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const el = cardRef.current;
    if (el) {
      toolCardLines.set(el, () => toolExpandedLines(part).join("\n"));
    }
  }, [part]);

  if (hasQuestions) {
    return (
      <div
        className={`rounded-md border px-3 py-2 text-xs ${
          isError
            ? "border-danger/40 bg-danger-subtle/30"
            : isCompleted
              ? "border-border bg-muted/25"
              : "border-warning/40 bg-warning/10"
        }`}
      >
        <div className="font-mono text-xs flex items-center gap-1.5 min-w-0">
          <span className="opacity-60 shrink-0">{icon}</span>
          <span className="truncate">{label}</span>
          {details && <span className="opacity-60 shrink-0">{details}</span>}
          {isPending && <span className="animate-pulse shrink-0">...</span>}
        </div>

        {isPending && port ? (
          <QuestionAnswerForm
            questions={questions}
            partKey={part.callID || part.id}
            port={port}
            provider={provider}
            sessionId={sessionId}
            callID={part.callID || ""}
            pendingQuestions={pendingQuestions}
            onResolved={onQuestionResolved}
          />
        ) : (
          <div className="mt-2 space-y-2 text-fg/90">
            <QuestionDisplay
              questions={questions}
              partKey={part.callID || part.id}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      data-tool-card
      onClick={toggleExpanded}
      onPointerDown={(event) => {
        pointerDownRef.current = {
          x: event.clientX,
          y: event.clientY,
          hadSelection: !!window.getSelection()?.toString(),
        };
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (clickTimerRef.current !== null) {
            window.clearTimeout(clickTimerRef.current);
            clickTimerRef.current = null;
          }
          toggleImmediately();
        }
      }}
      className={`cursor-pointer rounded-md border min-w-0 ${
        isError
          ? "border-danger/40 bg-danger-subtle/30"
          : isCompleted
            ? "border-border bg-muted/25"
            : isPending
              ? "border-warning/40 bg-warning/10"
              : "border-border bg-muted/25"
      }`}
    >
      {!expanded && (
        <div
          className={`w-full font-mono text-xs flex items-center gap-1.5 px-2.5 py-1 min-w-0 text-left ${
            isError
              ? "text-danger"
              : isCompleted
                ? "text-muted-fg"
                : isPending
                  ? "text-warning"
                  : "text-fg"
          }`}
        >
          <span className="opacity-60 shrink-0">{icon}</span>
          <span className="truncate">{label}</span>
          {details && <span className="opacity-60 shrink-0">{details}</span>}
          {isPending && <span className="animate-pulse shrink-0">...</span>}
          {canExpand && (
            <ChevronDownIcon size="12px" className="ml-auto shrink-0" />
          )}
        </div>
      )}
      {expanded && (
        <>
          <pre
            className={`max-w-full whitespace-pre-wrap break-words font-mono text-xs px-2.5 pt-2 pb-1 ${
              isError ? "text-danger" : "text-muted-fg"
            }`}
          >
            {toolExpandedLines(part).join("\n")}
          </pre>
          <div className="flex select-none items-center gap-1 px-2.5 pb-1.5 font-mono text-[11px] text-muted-fg/70">
            <ChevronDownIcon size="12px" className="rotate-180 shrink-0" />
            Click to collapse
          </div>
        </>
      )}
    </div>
  );
});

const MessageItem = memo(function MessageItem({
  message,
  port,
  provider,
  sessionId,
  pendingPermissions,
  pendingQuestions,
  onPermissionResolved,
  onQuestionResolved,
  onUndo,
  isOptimistic,
}: {
  message: MessageWithParts;
  port: number;
  provider?: BackendProvider;
  sessionId: string;
  pendingPermissions: PermissionRequest[];
  pendingQuestions: QuestionRequest[];
  onPermissionResolved: (requestId: string) => void;
  onQuestionResolved: (requestId: string) => void;
  onUndo?: (messageID: string) => void;
  isOptimistic?: boolean;
}) {
  const textContent = getMessageContent(message.parts);
  const isAssistant = message.info.role === "assistant";
  const messageError = isAssistant ? getAssistantError(message) : null;
  const toolCalls = message.parts.filter(isToolPart);
  const messagePermissions = pendingPermissions.filter(
    (perm) => perm.tool?.messageID === message.info.id,
  );
  const hasMainContent = !!(textContent || messageError);

  return (
    <>
      {hasMainContent && (
        <div className="py-3 px-6">
          <div className="flex gap-2">
            {isAssistant ? (
              <IconBadgeSparkle size="16px" className="shrink-0 mt-1" />
            ) : (
              <IconUser size="16px" className="shrink-0 mt-1" />
            )}
            <div className="flex-1 min-w-0">
              {!isAssistant && message.isQueued && (
                <Badge intent="warning" className="mb-1">
                  Queued
                </Badge>
              )}
              <div
                className={`prose prose-sm dark:prose-invert max-w-none overflow-x-hidden ${!isAssistant ? "text-muted-fg" : ""}`}
              >
                {textContent && (
                  <Markdown remarkPlugins={[remarkGfm]}>{textContent}</Markdown>
                )}
              </div>
              {messageError && (
                <ChatErrorAlert
                  title="Message failed"
                  message={messageError}
                  className={textContent ? "mt-2" : ""}
                />
              )}
            </div>
            {!isAssistant && !message.isQueued && !isOptimistic && onUndo && (
              <button
                type="button"
                onClick={() => onUndo(message.info.id)}
                className="shrink-0 mt-0.5 p-1 text-muted-fg hover:text-foreground transition-colors"
                aria-label="Undo to this message"
                title="Undo to this message"
              >
                <Undo2Icon size="15px" />
              </button>
            )}
          </div>
        </div>
      )}
      {toolCalls.length > 0 && (
        <div className="py-3 px-6">
          <div className="space-y-1">
            {toolCalls.map((part) => (
              <ToolCallItem
                key={part.callID || part.id}
                part={part}
                port={port}
                provider={provider}
                sessionId={sessionId}
                pendingQuestions={pendingQuestions}
                onQuestionResolved={onQuestionResolved}
              />
            ))}
          </div>
        </div>
      )}
      {messagePermissions.length > 0 && (
        <div className="py-3 px-6">
          <div className="space-y-2">
            {messagePermissions.map((permission) => (
              <PermissionRequestForm
                key={permission.id}
                permission={permission}
                port={port}
                provider={provider}
                onResolved={onPermissionResolved}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
});

function hasVisibleContent(message: MessageWithParts): boolean {
  const textContent = getMessageContent(message.parts);
  const hasToolCalls = message.parts.some(isToolPart);
  const messageError =
    message.info.role === "assistant" ? getAssistantError(message) : null;
  return !!(textContent || hasToolCalls || messageError);
}

function SessionPage() {
  const { id: sessionId } = Route.useParams();
  const { isDesktop } = useMediaQuery();
  const instance = useInstanceStore((s) => s.instance);
  const port = instance?.port ?? 0;
  const provider = instance?.provider;
  const supportsAgentSelection = provider === "opencode";
  const apiBase = port ? backendBasePath(provider, port) : "";

  const {
    messages,
    sessionMessages,
    isLoading: loading,
    error: messagesError,
  } = useSessionMessages(sessionId);
  const { data: sessionsData, mutate: mutateSessions } = useSessions();
  const { data: agentsData } = useAgents();
  const { data: sessionStatusesData, mutate: mutateSessionStatuses } =
    useSessionStatuses();
  const { data: permissionsData, mutate: mutatePermissions } = usePermissions();
  const { data: questionsData, mutate: mutateQuestions } = useQuestions();
  const selectedModel = useModelStore((s) => s.selectedModel);
  const selectedAgent = useAgentStore((s) => s.getSelectedAgent(sessionId));
  const setSelectedAgent = useAgentStore((s) => s.setSelectedAgent);
  const { setPageTitle } = useBreadcrumb();

  const sessions: Session[] = sessionsData ?? [];
  const agents: Agent[] = agentsData ?? [];
  const currentSession = sessions.find((s) => s.id === sessionId);
  const isChildSession = Boolean(currentSession?.parentID);
  const revertMessageID = currentSession?.revert?.messageID;

  const revertedMessages = useMemo(() => {
    if (!revertMessageID) return [];
    return messages.filter(
      (message) =>
        message.info.id >= revertMessageID &&
        message.info.role === "user",
    );
  }, [messages, revertMessageID]);

  const visibleMessages = useMemo(() => {
    if (!revertMessageID) return messages;
    return messages.filter((message) => message.info.id < revertMessageID);
  }, [messages, revertMessageID]);

  const optimisticMessageIDs = useMemo(() => {
    const ids = new Set<string>();
    for (const message of sessionMessages ?? []) {
      if (message.metadata?.portalOptimistic === true) {
        ids.add(message.id);
      }
    }
    return ids;
  }, [sessionMessages]);

  useEffect(() => {
    if (currentSession?.title) {
      setPageTitle(currentSession.title);
    }
    return () => setPageTitle(null);
  }, [currentSession?.title, setPageTitle]);

  useEffect(() => {
    const handleDocumentCopy = (event: ClipboardEvent) => {
      if (!event.clipboardData) return;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        return;
      }
      const range = selection.getRangeAt(0).cloneRange();
      const allCards = [
        ...document.querySelectorAll<HTMLElement>("[data-tool-card]"),
      ];
      const rangeRects = [...range.getClientRects()];
      const expandable = new Set<HTMLElement>();
      for (const card of allCards) {
        if (card.getAttribute("aria-expanded") === "true") continue;
        if (!range.intersectsNode(card)) continue;
        const labelEl = card.querySelector<HTMLElement>("[class*='truncate']");
        if (!labelEl) continue;
        const truncated =
          labelEl.scrollWidth > labelEl.clientWidth + 1 ||
          labelEl.textContent?.endsWith("...");
        if (!truncated) continue;
        const tn = [...labelEl.childNodes].find(
          (n): n is Text => n.nodeType === Node.TEXT_NODE,
        );
        if (!tn || tn.data.length === 0) continue;
        const cardRect = card.getBoundingClientRect();
        const onRow = rangeRects.filter(
          (rc) => rc.bottom > cardRect.top && rc.top < cardRect.bottom,
        );
        if (onRow.length === 0) continue;
        const selEndOnRow = Math.max(...onRow.map((rc) => rc.right));
        const boxRight = labelEl.getBoundingClientRect().right;
        const caretX = (i: number) => {
          const caretRange = document.createRange();
          caretRange.setStart(tn, i);
          caretRange.collapse(true);
          return caretRange.getBoundingClientRect().left;
        };
        let lo = 0;
        let hi = tn.data.length;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (caretX(mid) <= boxRight - 1) lo = mid;
          else hi = mid - 1;
        }
        const cap = caretX(lo);
        if (selEndOnRow < cap - 4) continue;
        expandable.add(card);
      }
      if (expandable.size === 0) return;
      const expandableCards = allCards.filter((card) => expandable.has(card));
      const firstCard = expandableCards[0];
      const lastCard = expandableCards[expandableCards.length - 1];
      if (firstCard.contains(range.startContainer)) {
        range.setStartBefore(firstCard);
      }
      if (lastCard.contains(range.endContainer)) {
        range.setEndAfter(lastCard);
      }
      const fragment = range.cloneContents();
      const clones = [...fragment.querySelectorAll("[data-tool-card]")];
      const inRange = allCards.filter((card) => range.intersectsNode(card));
      if (clones.length !== inRange.length) return;
      inRange.forEach((card, i) => {
        if (!expandable.has(card)) return;
        const div = document.createElement("div");
        div.textContent = toolCardLines.get(card)?.() ?? "";
        clones[i].replaceWith(div);
      });
      const host = document.createElement("div");
      host.setAttribute("aria-hidden", "true");
      host.style.cssText =
        "position:fixed;left:-9999px;top:0;pointer-events:none;white-space:pre;";
      host.append(fragment);
      document.body.append(host);
      const text = host.innerText;
      host.remove();
      event.preventDefault();
      event.clipboardData.setData("text/plain", text || range.toString());
    };
    document.addEventListener("copy", handleDocumentCopy);
    return () => document.removeEventListener("copy", handleDocumentCopy);
  }, []);

  useEffect(() => {
    if (!supportsAgentSelection) return;
    if (!sessionId || agents.length === 0) return;
    if (isValidSessionAgent(agents, selectedAgent)) return;

    const fallback = getDefaultSessionAgentName(agents);
    if (fallback) {
      setSelectedAgent(sessionId, fallback);
    }
  }, [
    agents,
    sessionId,
    selectedAgent,
    setSelectedAgent,
    supportsAgentSelection,
  ]);

  const [sendError, setSendError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [wrapped, setWrapped] = useState(false);
  const [dialog, setDialog] = useState<"mcps" | "status" | null>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasScrolledInitially, setHasScrolledInitially] = useState(false);
  const [fileResults, setFileResults] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const measureRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submitLockRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const prevMessagesLengthRef = useRef(0);
  const fileMention = useFileMention();
  const slashCommand = useSlashCommand();
  const { commands } = useCommands();

  useEffect(() => {
    const t = textareaRef.current;
    const m = measureRef.current;
    if (!t || !m) return;
    const cs = getComputedStyle(t);
    const wrapperEl = t.parentElement?.parentElement;
    const larguraCampo = wrapperEl?.clientWidth ?? t.clientWidth;
    m.value = input;
    m.style.width = `${Math.max(100, larguraCampo - 96)}px`;
    m.style.lineHeight = cs.lineHeight;
    m.style.fontSize = cs.fontSize;
    m.style.fontFamily = cs.fontFamily;
    m.style.padding = "0";
    m.style.border = "0";
    const linhas = Math.round(m.scrollHeight / parseFloat(cs.lineHeight));
    setWrapped(linhas > 1);
  }, [input]);

  const messagesLoadError = messagesError?.message;

  const sessionStatus = sessionId
    ? sessionStatusesData?.[sessionId]
    : undefined;
  const sending = useMemo(() => {
    const statusActive =
      sessionStatus?.type === "busy" || sessionStatus?.type === "retry";
    const hasPendingUser = sessionMessages.some(
      (message) =>
        message.type === "user" && message.metadata?.portalPending === true,
    );

    return isSubmitting || statusActive || hasPendingUser;
  }, [isSubmitting, sessionMessages, sessionStatus?.type]);

  const pendingPermissions = useMemo(
    () =>
      ((permissionsData ?? []) as PermissionRequest[]).filter(
        (item) => item.sessionID === sessionId,
      ),
    [permissionsData, sessionId],
  );

  const pendingQuestions = useMemo(
    () =>
      ((questionsData ?? []) as QuestionRequest[]).filter(
        (item) => item.sessionID === sessionId,
      ),
    [questionsData, sessionId],
  );

  const handlePermissionResolved = useCallback(
    (requestId: string) => {
      void mutatePermissions(
        (current: PermissionRequest[] | undefined) =>
          (current ?? []).filter((permission) => permission.id !== requestId),
        { revalidate: false },
      );
      if (port && sessionId) {
        mutateSessionMessages(port, sessionId, provider);
      }
    },
    [port, provider, sessionId, mutatePermissions],
  );

  const handleQuestionResolved = useCallback(
    (requestId: string) => {
      void mutateQuestions(
        (current: QuestionRequest[] | undefined) =>
          (current ?? []).filter((question) => question.id !== requestId),
        { revalidate: false },
      );
      if (port && sessionId) {
        mutateSessionMessages(port, sessionId, provider);
      }
    },
    [port, provider, sessionId, mutateQuestions],
  );

  const visibleMessageIds = useMemo(
    () => new Set(messages.map((m) => m.info.id)),
    [messages],
  );
  const unlinkedPermissions = pendingPermissions.filter(
    (perm) =>
      !perm.tool?.messageID || !visibleMessageIds.has(perm.tool.messageID),
  );

  const scrollToBottom = useCallback(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, []);

  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;

    const handleVisualViewportChange = () => {
      const diff = window.innerHeight - visualViewport.height;
      if (diff > 0 && diff < window.innerHeight * 0.6) {
        setKeyboardOffset(diff);
      } else {
        setKeyboardOffset(0);
      }
    };

    visualViewport.addEventListener("resize", handleVisualViewportChange);
    visualViewport.addEventListener("scroll", handleVisualViewportChange);
    handleVisualViewportChange();

    return () => {
      visualViewport.removeEventListener(
        "resize",
        handleVisualViewportChange,
      );
      visualViewport.removeEventListener(
        "scroll",
        handleVisualViewportChange,
      );
    };
  }, []);

  const checkIfNearBottom = useCallback(() => {
    const container = chatContainerRef.current;
    if (!container) return true;

    const threshold = 100;
    const isNear =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      threshold;
    isNearBottomRef.current = isNear;
    return isNear;
  }, []);

  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      checkIfNearBottom();
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [checkIfNearBottom]);

  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current) {
      if (isNearBottomRef.current) {
        setTimeout(() => {
          scrollToBottom();
        }, 50);
      }
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    if (!hasScrolledInitially && !loading && messages.length > 0) {
      setTimeout(() => {
        scrollToBottom();
        setHasScrolledInitially(true);
        isNearBottomRef.current = true;
      }, 100);
    }
  }, [hasScrolledInitially, loading, messages.length, scrollToBottom]);

  useEffect(() => {
    setHasScrolledInitially(false);
    isNearBottomRef.current = true;
  }, [sessionId]);

  const sendMessage = useCallback(
    async (
      messageText: string,
      messageId: string,
      messageAttachments: Attachment[] = [],
    ) => {
      if (!sessionId || !port) return;

      try {
        let agentOverride: string | undefined;
        if (supportsAgentSelection) {
          const defaultAgent = isValidSessionAgent(
            agents,
            currentSession?.agent,
          )
            ? currentSession?.agent
            : getDefaultSessionAgentName(agents);
          agentOverride =
            selectedAgent && selectedAgent !== defaultAgent
              ? selectedAgent
              : undefined;
        }

        const response = await fetch(`${apiBase}/session/${sessionId}/prompt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messageID: messageId,
            text: messageText || undefined,
            parts: messageAttachments.map((attachment) => ({
              type: "file",
              mime: attachment.mime,
              filename: attachment.name,
              url: attachment.url,
            })),
            model:
              selectedModel.providerID && selectedModel.modelID
                ? selectedModel
                : undefined,
            agent: agentOverride,
          }),
        });

        if (!response.ok) {
          const fallback = `Failed to send message (${response.status}${
            response.statusText ? ` ${response.statusText}` : ""
          })`;
          throw new Error(await getResponseErrorMessage(response, fallback));
        }

        const result = (await response.json()) as PromptSendResponse;
        if (result.message?.id) {
          reconcileOptimisticMessage(
            port,
            sessionId,
            messageId,
            result.message,
            provider,
          );
        } else {
          settleOptimisticMessage(port, sessionId, messageId, provider);
        }

        isNearBottomRef.current = true;
        mutateSessionMessages(port, sessionId, provider);
        mutateSessionStatuses();
        mutateSessions();
      } catch (err) {
        setSendError(
          err instanceof Error ? err.message : "Failed to send message",
        );
        removeOptimisticMessage(port, sessionId, messageId, provider);
      }
    },
    [
      sessionId,
      port,
      provider,
      apiBase,
      currentSession?.agent,
      agents,
      selectedAgent,
      supportsAgentSelection,
      selectedModel,
      mutateSessionStatuses,
      mutateSessions,
    ],
  );

  const runBuiltinAction = useCallback(
    async (action: string, messageID?: string) => {
      if (!sessionId || !port) return;
      try {
        const response = await fetch(
          `${apiBase}/session/${sessionId}/builtin`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action,
              ...(messageID ? { messageID } : {}),
            }),
          },
        );

        if (!response.ok) {
          const fallback = `Failed to run /${action} (${response.status}${
            response.statusText ? ` ${response.statusText}` : ""
          })`;
          throw new Error(await getResponseErrorMessage(response, fallback));
        }
      } catch (err) {
        setSendError(
          err instanceof Error ? err.message : `Failed to run /${action}`,
        );
      } finally {
        mutateSessionMessages(port, sessionId, provider);
        mutateSessionStatuses();
        mutateSessions();
      }
    },
    [
      apiBase,
      sessionId,
      port,
      provider,
      mutateSessionMessages,
      mutateSessionStatuses,
      mutateSessions,
    ],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const messageText = input.trim();
    if (
      (!messageText && attachments.length === 0) ||
      !sessionId ||
      !port ||
      submitLockRef.current
    ) {
      return;
    }

    const wasSending = sending;
    submitLockRef.current = true;
    setIsSubmitting(true);
    const messageId = createClientMessageId();
    setInput("");
    setSendError(null);

    const isShellCommand = messageText.startsWith("!");
    const firstLine = messageText.split("\n")[0];
    const [firstWord, ...firstWordArgs] = firstLine.split(" ");
    const isBuiltinCommand =
      messageText.startsWith("/") &&
      ["compact", "share", "unshare", "fork"].includes(
        firstWord.slice(1),
      );
    const isSlashCommand =
      !isBuiltinCommand &&
      messageText.startsWith("/") &&
      commands.some((command) => command.name === firstWord.slice(1));

    if (firstWord === "/mcps" || firstWord === "/status") {
      setDialog(firstWord.slice(1) as "mcps" | "status");
      submitLockRef.current = false;
      setIsSubmitting(false);
      return;
    }

    if (isShellCommand || isSlashCommand || isBuiltinCommand) {
      void (async () => {
        try {
          const [firstLineText, ...restLines] = messageText.split("\n");
          const [, ...firstLineArgs] = firstLineText.split(" ");
          const args =
            firstLineArgs.join(" ") +
            (restLines.length > 0 ? "\n" + restLines.join("\n") : "");

          let url: string;
          let body: Record<string, unknown>;

          if (isShellCommand) {
            url = `${apiBase}/session/${sessionId}/shell`;
            body = { messageID: messageId, command: firstLineText.slice(1) };
          } else if (isBuiltinCommand) {
            await runBuiltinAction(firstWord.slice(1));
            return;
          } else {
            url = `${apiBase}/session/${sessionId}/command`;
            body = {
              messageID: messageId,
              command: firstWord.slice(1),
              arguments: args,
            };
          }

          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

          if (!response.ok) {
            const fallback = `Failed to run command (${response.status}${
              response.statusText ? ` ${response.statusText}` : ""
            })`;
            throw new Error(await getResponseErrorMessage(response, fallback));
          }
        } catch (err) {
          setSendError(
            err instanceof Error ? err.message : "Failed to run command",
          );
        } finally {
          submitLockRef.current = false;
          setIsSubmitting(false);
        }
      })();

      isNearBottomRef.current = true;
      scrollToBottom();
      return;
    }

    const optimisticParts: Part[] = [
      ...attachments.map((attachment) => ({
        id: `${messageId}-part-${attachment.id}`,
        sessionID: sessionId,
        messageID: messageId,
        type: "file" as const,
        mime: attachment.mime,
        filename: attachment.name,
        url: attachment.url,
      })),
    ];
    if (messageText) {
      optimisticParts.push({
        id: `${messageId}-part`,
        sessionID: sessionId,
        messageID: messageId,
        type: "text",
        text: messageText,
      });
    }

    const optimisticMessage: MessageWithParts = {
      info: {
        id: messageId,
        sessionID: sessionId,
        role: "user",
        time: { created: Date.now() },
        agent: "user",
        model: { providerID: "", modelID: "" },
      },
      parts: optimisticParts,
      isQueued: wasSending,
    };
    addOptimisticMessage(port, sessionId, optimisticMessage, provider);

    const messageAttachments = attachments;
    setAttachments([]);

    void sendMessage(messageText, messageId, messageAttachments).finally(
      () => {
        submitLockRef.current = false;
        setIsSubmitting(false);
      },
    );

    isNearBottomRef.current = true;
    scrollToBottom();
  };

  useEffect(() => {
    submitLockRef.current = false;
    setIsSubmitting(false);
  }, [port, sessionId]);

  useEffect(() => {
    if (!sending || !port || !sessionId) return;

    const interval = window.setInterval(() => {
      mutateSessionMessages(port, sessionId, provider);
    }, 10000);

    return () => window.clearInterval(interval);
  }, [port, provider, sending, sessionId]);

  const handleAttachFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(
          `${file.name} is too large (max ${formatFileSize(
            MAX_ATTACHMENT_BYTES,
          )})`,
        );
        continue;
      }
      if (!isAcceptedAttachmentMime(file.type)) {
        toast.error(`${file.name} has an unsupported type`);
        continue;
      }
      readFileAsDataUrl(file)
        .then((url) => {
          setAttachments((prev) => [
            ...prev,
            {
              id: `${file.name}-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 7)}`,
              name: file.name,
              mime: file.type,
              url,
              size: file.size,
            },
          ]);
        })
        .catch(() => toast.error(`Failed to read ${file.name}`));
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
  };

  return (
    <div
      className="-m-4 flex h-[calc(100%+2rem)] flex-col"
      style={keyboardOffset > 0 ? { paddingBottom: keyboardOffset } : undefined}
    >
      <div
        className="flex-1 overflow-auto overflow-x-hidden"
        ref={chatContainerRef}
      >
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader className="size-6" />
          </div>
        )}

        {messagesLoadError && (
          <div className="rounded-md bg-danger-subtle p-4 m-4 text-danger-subtle-fg">
            Error: {messagesLoadError}
          </div>
        )}

        {!loading && !messagesLoadError && messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-muted-fg">No messages yet</div>
          </div>
        )}

        <div className="divide-y divide-dashed divide-border overflow-x-hidden">
          {visibleMessages
            .filter((message) => hasVisibleContent(message))
            .map((message) => (
              <MessageItem
                key={message.info.id}
                message={message}
                port={port}
                provider={provider}
                sessionId={sessionId}
                pendingPermissions={pendingPermissions}
                pendingQuestions={pendingQuestions}
                onPermissionResolved={handlePermissionResolved}
                onQuestionResolved={handleQuestionResolved}
                onUndo={
                  isChildSession
                    ? undefined
                    : (messageID) => void runBuiltinAction("undo", messageID)
                }
                isOptimistic={optimisticMessageIDs.has(message.info.id)}
              />
            ))}
          {revertedMessages.length > 0 && (
            <div className="flex items-center justify-between gap-3 px-6 py-4">
              <span className="text-sm text-muted-fg">
                {revertedMessages.length}{" "}
                {revertedMessages.length === 1 ? "message" : "messages"}{" "}
                reverted
              </span>
              {!isChildSession && (
                <Button
                  size="sm"
                  intent="outline"
                  onPress={() => void runBuiltinAction("redo")}
                >
                  Redo
                </Button>
              )}
            </div>
          )}
          {unlinkedPermissions.length > 0 && (
            <div className="px-6 py-4 space-y-2 border-t border-dashed border-border">
              {unlinkedPermissions.map((permission) => (
                <PermissionRequestForm
                  key={permission.id}
                  permission={permission}
                  port={port}
                  provider={provider}
                  onResolved={handlePermissionResolved}
                />
              ))}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {sending && (
          <div className="py-3 px-6">
            <div className="flex items-center gap-2">
              <Ripples size="30" speed="2" color="var(--color-primary)" />
              <span className="text-sm text-muted-fg">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      {isChildSession ? (
        <div className="border-t border-border px-4 py-3 shrink-0">
          <p className="text-sm text-muted-fg">
            Child session — read only. Open the parent session to continue.
          </p>
        </div>
      ) : (
      <div className="border-t border-border p-3 pb-1 shrink-0 relative">
        <FileMentionPopover
          isOpen={fileMention.isOpen}
          searchQuery={fileMention.searchQuery}
          textareaRef={textareaRef}
          mentionStart={fileMention.mentionStart}
          selectedIndex={fileMention.selectedIndex}
          onSelectedIndexChange={fileMention.setSelectedIndex}
          onFilesChange={setFileResults}
          onClose={fileMention.close}
          onSelect={(filePath) => {
            const newValue = fileMention.handleSelect(filePath, input);
            setInput(newValue);
          }}
        />
        <CommandPopover
          isOpen={slashCommand.isOpen}
          trigger={slashCommand.trigger}
          searchQuery={slashCommand.searchQuery}
          selectedIndex={slashCommand.selectedIndex}
          commands={commands}
          textareaRef={textareaRef}
          onClose={slashCommand.close}
          onSelectedIndexChange={slashCommand.setSelectedIndex}
          onSelect={(value) => {
            const newValue = slashCommand.handleSelect(value, input);
            setInput(newValue);
          }}
        />
        <form onSubmit={handleSubmit} className="w-full">
          {sendError && (
            <ChatErrorAlert
              title="Message failed"
              message={sendError}
              className="mb-3"
            />
          )}
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {attachments.map((attachment) => (
                <span
                  key={attachment.id}
                  className="flex max-w-full items-center gap-1.5 rounded-full border border-border bg-secondary/40 py-0.5 pl-2.5 pr-1 text-xs text-fg"
                >
                  <span className="truncate">{attachment.name}</span>
                  <span className="shrink-0 text-[10px] text-muted-fg">
                    {formatFileSize(attachment.size)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${attachment.name}`}
                    className="shrink-0 rounded-full p-0.5 text-muted-fg transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => removeAttachment(attachment.id)}
                  >
                    <XMarkIcon className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="relative rounded-lg border border-input bg-background transition-colors hover:border-muted-fg/30 focus-within:border-ring/70 focus-within:ring-3 focus-within:ring-ring/20">
            <div
              className={`max-h-60 overflow-y-auto scroll-pb-2 ${
                wrapped ? "mb-12" : ""
              }`}
            >
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                const value = e.target.value;
                setInput(value);
                const cursorPos = e.target.selectionStart ?? value.length;
                slashCommand.handleInputChange(value, cursorPos, commands);
                if (fileMention.isOpen || value.includes("@")) {
                  fileMention.handleInputChange(value, cursorPos);
                }
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                const value = target.value;
                const cursorPos = target.selectionStart ?? value.length;
                slashCommand.handleInputChange(value, cursorPos, commands);
                if (value.includes("@")) {
                  fileMention.handleInputChange(value, cursorPos);
                }
              }}
              onSelect={(e) => {
                const target = e.target as HTMLTextAreaElement;
                if (fileMention.isOpen || input.includes("@")) {
                  const cursorPos = target.selectionStart ?? input.length;
                  fileMention.handleInputChange(input, cursorPos);
                }
              }}
              onKeyDown={(e) => {
                const handledSlash = slashCommand.handleKeyDown(
                  e,
                  slashCommand.trigger === "slash"
                    ? commands.filter(
                        (command) =>
                          command.name
                            .toLowerCase()
                            .includes(slashCommand.searchQuery.toLowerCase()) ||
                          (command.description ?? "")
                            .toLowerCase()
                            .includes(slashCommand.searchQuery.toLowerCase()),
                      ).length
                    : 1,
                );
                if (handledSlash) {
                  if (
                    (e.key === "Enter" || e.key === "Tab") &&
                    slashCommand.isOpen
                  ) {
                    const list =
                      slashCommand.trigger === "slash"
                        ? commands.filter(
                            (command) =>
                              command.name
                                .toLowerCase()
                                .includes(
                                  slashCommand.searchQuery.toLowerCase(),
                                ) ||
                              (command.description ?? "")
                                .toLowerCase()
                                .includes(
                                  slashCommand.searchQuery.toLowerCase(),
                                ),
                          )
                        : [{ name: "" }];
                    const selected = list[slashCommand.selectedIndex];
                    if (selected) {
                      const newValue = slashCommand.handleSelect(
                        slashCommand.trigger === "bang"
                          ? "!"
                          : `/${selected.name}`,
                        input,
                      );
                      setInput(newValue);
                    }
                  }
                  return;
                }
                const handled = fileMention.handleKeyDown(
                  e,
                  fileResults.length,
                );
                if (handled) {
                  if (
                    (e.key === "Enter" || e.key === "Tab") &&
                    fileResults.length > 0
                  ) {
                    const selectedFile = fileResults[fileMention.selectedIndex];
                    if (selectedFile) {
                      const newValue = fileMention.handleSelect(
                        selectedFile,
                        input,
                      );
                      setInput(newValue);
                    }
                  }
                  return;
                }
                if (isDesktop && e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim() && !submitLockRef.current) {
                    handleSubmit(e as unknown as React.FormEvent);
                  }
                }
              }}
              onBlur={() => slashCommand.close()}
              placeholder="Type a message... (use @ for files)"
              className={`w-full min-w-0 resize-none border-0! rounded-none! bg-transparent! focus:ring-0! ${wrapped ? "min-h-12 py-2" : "min-h-11 pt-3 pb-1 pl-11! pr-13!"}`}
              rows={5}
            />
            </div>
            <button
              type="button"
              aria-label="Attach files"
              className="absolute left-1 bottom-1 z-10 flex size-9 items-center justify-center rounded-md text-muted-fg transition-colors hover:bg-muted/40 hover:text-foreground active:bg-muted/60"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => fileInputRef.current?.click()}
            >
              <PaperclipIcon />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              accept={ACCEPTED_ATTACHMENT_MIMES}
              onChange={handleAttachFiles}
            />
            {(input.trim() || attachments.length > 0) && (
              <Button
                type="submit"
                isDisabled={
                  (!input.trim() && attachments.length === 0) || isSubmitting
                }
                isCircle
                size="sq-sm"
                aria-label={
                  isSubmitting
                    ? "Sending message"
                    : sending
                      ? "Queue message"
                      : "Send message"
                }
                className="absolute right-2 bottom-1"
              >
                {isSubmitting ? (
                  <span className="grid size-4 place-items-center">
                    <Loader className="size-4" aria-label="Sending message" />
                  </span>
                ) : sending ? (
                  <span className="grid size-4 place-items-center">
                    <ListPlusIcon size="16px" />
                  </span>
                ) : (
                  <span className="grid size-4 place-items-center">
                    <SendIcon size="16px" />
                  </span>
                )}
              </Button>
            )}
            <textarea
              ref={measureRef}
              aria-hidden="true"
              tabIndex={-1}
              readOnly
              rows={1}
              className="invisible pointer-events-none absolute left-0 top-0 h-auto resize-none overflow-hidden"
            />
          </div>
          <div className="mt-1 flex items-center gap-2">
            {supportsAgentSelection && <AgentSelect sessionId={sessionId} />}
            <ModelSelect />
          </div>
        </form>
      </div>
      )}
      <McpDialog
        isOpen={dialog === "mcps"}
        onOpenChange={(open) => !open && setDialog(null)}
      />
      <StatusDialog
        isOpen={dialog === "status"}
        onOpenChange={(open) => !open && setDialog(null)}
      />
    </div>
  );
}
