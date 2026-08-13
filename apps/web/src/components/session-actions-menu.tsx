import { useEffect, useRef, useState } from "react";
import {
  ModalOverlay,
  Modal,
  Dialog,
} from "react-aria-components";
import {
  PencilLineIcon,
  TrashIcon,
  FolderInputIcon,
  EllipsisHorizontalIcon,
} from "@/components/icons/lucide";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { Input } from "@/components/ui/input";

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
  const [mode, setMode] = useState<"rename" | "move" | "delete" | null>(null);
  const [textValue, setTextValue] = useState("");
  const [busy, setBusy] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === "rename") setTextValue(sessionTitle);
    if (mode === "move") setTextValue("");
  }, [mode, sessionTitle]);

  const closeDialogs = () => {
    setMode(null);
    setBusy(false);
  };

  const runAction = async (fn: () => Promise<void>, successLabel: string) => {
    setBusy(true);
    try {
      await fn();
      closeDialogs();
      onOpenChange(false);
      toast.success(successLabel);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Action failed",
      );
      setBusy(false);
    }
  };

  const handleDelete = () => {
    closeDialogs();
    onOpenChange(false);
    onDelete(sessionId);
  };

  const modalClass =
    "fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4";
  const dialogClass =
    "w-full max-w-sm rounded-xl border border-border bg-bg shadow-2xl outline-hidden";

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
              className="fixed z-[55] w-44 rounded-lg border border-border bg-bg p-1 shadow-2xl"
              style={{
                top: Math.max(
                  triggerRef.current.getBoundingClientRect().bottom + 4,
                  8,
                ),
                left: Math.max(
                  triggerRef.current.getBoundingClientRect().left - 40,
                  8,
                ),
              }}
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted/50"
                onClick={() => {
                  onOpenChange(false);
                  setMode("rename");
                }}
              >
                <PencilLineIcon className="size-4 shrink-0 text-muted-fg" />
                <span className="min-w-0 flex-1">Rename</span>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted/50"
                onClick={() => {
                  onOpenChange(false);
                  setMode("move");
                }}
              >
                <FolderInputIcon className="size-4 shrink-0 text-muted-fg" />
                <span className="min-w-0 flex-1">Move</span>
              </button>
              <div className="my-1 h-px bg-border" />
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-danger-fg transition-colors hover:bg-danger/10"
                onClick={() => {
                  onOpenChange(false);
                  setMode("delete");
                }}
              >
                <TrashIcon className="size-4 shrink-0" />
                <span className="min-w-0 flex-1">Delete</span>
              </button>
            </div>
          )}
        </>
      )}

      {mode === "rename" && (
        <ModalOverlay
          isOpen
          onOpenChange={(open) => !open && closeDialogs()}
          isDismissable
          className={modalClass}
        >
          <Modal className="outline-hidden">
            <Dialog className={dialogClass} aria-label="Rename session">
              <div className="px-5 pt-4 pb-2">
                <h2 className="text-lg font-semibold text-fg">
                  Rename session
                </h2>
                <p className="mt-1 text-sm text-muted-fg">
                  Give this session a new title.
                </p>
              </div>
              <div className="px-5 py-3">
                <TextField autoFocus className="w-full">
                  <Input
                    ref={inputRef}
                    value={textValue}
                    onChange={(e) => setTextValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && textValue.trim() && !busy) {
                        runAction(
                          () => onRename(sessionId, textValue.trim()),
                          "Session renamed",
                        );
                      }
                    }}
                    placeholder="Session title"
                    className="w-full"
                  />
                </TextField>
              </div>
              <div className="flex flex-col-reverse justify-end gap-2 px-5 py-4 pt-2 sm:flex-row">
                <Button intent="plain" isDisabled={busy} onPress={closeDialogs}>
                  Cancel
                </Button>
                <Button
                  intent="primary"
                  isDisabled={!textValue.trim() || busy}
                  onPress={() =>
                    runAction(
                      () => onRename(sessionId, textValue.trim()),
                      "Session renamed",
                    )
                  }
                >
                  {busy ? "Saving..." : "Rename"}
                </Button>
              </div>
            </Dialog>
          </Modal>
        </ModalOverlay>
      )}

      {mode === "move" && (
        <ModalOverlay
          isOpen
          onOpenChange={(open) => !open && closeDialogs()}
          isDismissable
          className={modalClass}
        >
          <Modal className="outline-hidden">
            <Dialog className={dialogClass} aria-label="Move session">
              <div className="px-5 pt-4 pb-2">
                <h2 className="text-lg font-semibold text-fg">
                  Move session
                </h2>
                <p className="mt-1 text-sm text-muted-fg">
                  Move to another directory in the same project. Absolute path
                  required.
                </p>
              </div>
              <div className="px-5 py-3">
                <TextField autoFocus className="w-full">
                  <Input
                    ref={inputRef}
                    value={textValue}
                    onChange={(e) => setTextValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && textValue.trim() && !busy) {
                        runAction(
                          () => onMove(sessionId, textValue.trim()),
                          "Session moved",
                        );
                      }
                    }}
                    placeholder="/path/to/directory"
                    className="w-full"
                  />
                </TextField>
              </div>
              <div className="flex flex-col-reverse justify-end gap-2 px-5 py-4 pt-2 sm:flex-row">
                <Button intent="plain" isDisabled={busy} onPress={closeDialogs}>
                  Cancel
                </Button>
                <Button
                  intent="primary"
                  isDisabled={!textValue.trim() || busy}
                  onPress={() =>
                    runAction(
                      () => onMove(sessionId, textValue.trim()),
                      "Session moved",
                    )
                  }
                >
                  {busy ? "Moving..." : "Move"}
                </Button>
              </div>
            </Dialog>
          </Modal>
        </ModalOverlay>
      )}

      {mode === "delete" && (
        <ModalOverlay
          isOpen
          onOpenChange={(open) => !open && closeDialogs()}
          isDismissable
          className={modalClass}
        >
          <Modal className="outline-hidden">
            <Dialog className={dialogClass} aria-label="Delete session">
              <div className="px-5 pt-4 pb-2">
                <h2 className="text-lg font-semibold text-fg">
                  Delete session?
                </h2>
                <p className="mt-1 text-sm text-muted-fg">
                  This will permanently delete the session. This action cannot
                  be undone.
                </p>
              </div>
              <div className="flex flex-col-reverse justify-end gap-2 px-5 py-4 pt-2 sm:flex-row">
                <Button intent="plain" isDisabled={busy} onPress={closeDialogs}>
                  Cancel
                </Button>
                <Button intent="danger" isDisabled={busy} onPress={handleDelete}>
                  Delete
                </Button>
              </div>
            </Dialog>
          </Modal>
        </ModalOverlay>
      )}
    </>
  );
}
