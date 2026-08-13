import { useEffect, useRef, useState } from "react";
import {
  PencilLineIcon,
  TrashIcon,
  FolderInputIcon,
  EllipsisHorizontalIcon,
} from "@/components/icons/lucide";
import { toast } from "@/components/ui/toast";

interface SessionActionsMenuProps {
  sessionId: string;
  sessionTitle: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (sessionId: string) => void;
  onRename: (sessionId: string, title: string) => Promise<void>;
  onMove: (sessionId: string, directory: string) => Promise<void>;
}

export function SessionActionsMenu({
  sessionId,
  sessionTitle,
  isOpen,
  onOpenChange,
  onDelete,
  onRename,
  onMove,
}: SessionActionsMenuProps) {
  const [mode, setMode] = useState<"rename" | "move" | null>(null);
  const [textValue, setTextValue] = useState("");
  const [busy, setBusy] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (mode === "rename") setTextValue(sessionTitle);
    if (mode === "move") setTextValue("");
  }, [mode, sessionTitle]);

  const runAction = async (fn: () => Promise<void>, label: string) => {
    setBusy(true);
    try {
      await fn();
      setMode(null);
      onOpenChange(false);
      toast.success(label);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Failed to ${label.toLowerCase()}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const itemClass = (danger = false) =>
    `flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors ${
      danger
        ? "text-danger-fg hover:bg-danger/10"
        : "text-foreground hover:bg-muted/50"
    }`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Session options"
        className="rounded-md p-1 text-muted-fg hover:text-foreground"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenChange(!isOpen);
        }}
      >
        <EllipsisHorizontalIcon />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-50"
            onMouseDown={() => onOpenChange(false)}
            onTouchStart={() => onOpenChange(false)}
          />
          {triggerRef.current && (
            <div
              className="fixed z-[55] min-w-44 rounded-lg border border-border bg-bg p-1 shadow-2xl"
              style={{
                top: Math.max(
                  triggerRef.current.getBoundingClientRect().bottom + 4,
                  8,
                ),
                left: Math.min(
                  triggerRef.current.getBoundingClientRect().left,
                  window.innerWidth - 200,
                ),
              }}
            >
              <button
                type="button"
                className={itemClass()}
                onClick={() => {
                  onOpenChange(false);
                  setMode("rename");
                }}
              >
                <PencilLineIcon />
                Rename
              </button>
              <button
                type="button"
                className={itemClass()}
                onClick={() => {
                  onOpenChange(false);
                  setMode("move");
                }}
              >
                <FolderInputIcon />
                Move
              </button>
              <div className="my-1 h-px bg-border" />
              <button
                type="button"
                className={itemClass(true)}
                onClick={() => {
                  onOpenChange(false);
                  onDelete(sessionId);
                }}
              >
                <TrashIcon />
                Delete
              </button>
            </div>
          )}
        </>
      )}

      {mode === "rename" && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setMode(null);
          }}
        >
          <div className="w-full max-w-sm rounded-xl border border-border bg-bg p-5 shadow-2xl">
            <h2 className="mb-1 text-lg font-semibold">Rename session</h2>
            <p className="mb-4 text-sm text-muted-fg">
              Give this session a new title.
            </p>
            <input
              autoFocus
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && textValue.trim() && !busy) {
                  runAction(
                    () => onRename(sessionId, textValue.trim()),
                    "Session renamed",
                  );
                }
                if (e.key === "Escape") setMode(null);
              }}
              placeholder="Session title"
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-hidden focus:border-ring/70 focus:ring-3 focus:ring-ring/20"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMode(null)}
                className="rounded-lg px-3 py-1.5 text-sm hover:bg-muted/50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!textValue.trim() || busy}
                onClick={() =>
                  runAction(
                    () => onRename(sessionId, textValue.trim()),
                    "Session renamed",
                  )
                }
                className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-fg disabled:opacity-50"
              >
                {busy ? "Saving..." : "Rename"}
              </button>
            </div>
          </div>
        </div>
      )}

      {mode === "move" && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setMode(null);
          }}
        >
          <div className="w-full max-w-sm rounded-xl border border-border bg-bg p-5 shadow-2xl">
            <h2 className="mb-1 text-lg font-semibold">Move session</h2>
            <p className="mb-4 text-sm text-muted-fg">
              Move to another directory in the same project. Absolute path
              required.
            </p>
            <input
              autoFocus
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && textValue.trim() && !busy) {
                  runAction(
                    () => onMove(sessionId, textValue.trim()),
                    "Session moved",
                  );
                }
                if (e.key === "Escape") setMode(null);
              }}
              placeholder="/path/to/directory"
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-hidden focus:border-ring/70 focus:ring-3 focus:ring-ring/20"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMode(null)}
                className="rounded-lg px-3 py-1.5 text-sm hover:bg-muted/50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!textValue.trim() || busy}
                onClick={() =>
                  runAction(
                    () => onMove(sessionId, textValue.trim()),
                    "Session moved",
                  )
                }
                className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-fg disabled:opacity-50"
              >
                {busy ? "Moving..." : "Move"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
