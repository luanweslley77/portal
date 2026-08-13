import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const inputRef = useRef<HTMLInputElement>(null!);
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const compute = () => {
      const trigger = triggerRef.current;
      const card = cardRef.current;
      if (!trigger || !card) return;
      const tr = trigger.getBoundingClientRect();
      const cardHeight = card.getBoundingClientRect().height;
      const gap = 4;
      let top = tr.bottom + gap;
      if (top + cardHeight > window.innerHeight - 8) {
        top = Math.max(8, tr.top - cardHeight - gap);
      }
      setPosition({
        top,
        right: Math.max(window.innerWidth - tr.right + 8, 8),
      });
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [isOpen, sessionId]);

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

  const suppressClickRef = useRef(false);

  const suppressNextClick = () => {
    suppressClickRef.current = true;
    const guard = (e: MouseEvent) => {
      if (!suppressClickRef.current) return;
      suppressClickRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      document.removeEventListener("click", guard, true);
    };
    document.addEventListener("click", guard, true);
    setTimeout(() => {
      suppressClickRef.current = false;
      document.removeEventListener("click", guard, true);
    }, 600);
  };

  useEffect(() => {
    if (!isOpen) return;
    const onScroll = () => onOpenChange(false);
    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }, [isOpen, onOpenChange]);

  const modalClass =
    "fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4";
  const dialogClass =
    "w-full max-w-sm rounded-xl border border-border bg-bg shadow-2xl outline-hidden";

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        aria-label="Session options"
        intent="plain"
        className="absolute right-0 top-0 z-10 h-full items-center justify-end rounded-none pr-2.5 text-muted-fg opacity-0 pointer-events-none hover:text-foreground focus-visible:opacity-100 group-hover/sidebar-item:pointer-events-auto group-hover/sidebar-item:opacity-100 group-focus-visible/sidebar-item:pointer-events-auto group-focus-visible/sidebar-item:opacity-100"
        onPress={() => {
          onOpenChange(!isOpen);
        }}
      >
        <EllipsisHorizontalIcon />
      </Button>

      {isOpen &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-50"
              onMouseDown={() => onOpenChange(false)}
              onTouchStart={() => {
                onOpenChange(false);
                suppressNextClick();
              }}
            />
            <div
              ref={cardRef}
              className="fixed z-[55] max-h-[calc(100svh-16px)] w-44 touch-manipulation overflow-y-auto rounded-lg border border-border bg-bg p-1 shadow-2xl"
              style={
                position
                  ? { top: position.top, right: position.right }
                  : undefined
              }
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
          </>,
          document.body,
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
