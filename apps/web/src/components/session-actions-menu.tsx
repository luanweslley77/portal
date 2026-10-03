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
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { SidebarMenuTrigger } from "@/components/ui/sidebar";

interface SessionActionsMenuProps {
  sessionId: string;
  sessionTitle: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (sessionId: string) => void;
  onRename: (sessionId: string, title: string) => Promise<void>;
  onMove: (sessionId: string, directory: string) => Promise<void>;
  onDialogOpenChange?: (open: boolean) => void;
}

export function SessionActionsMenu({
  sessionId,
  sessionTitle,
  isOpen,
  onOpenChange,
  onDelete,
  onRename,
  onMove,
  onDialogOpenChange,
}: SessionActionsMenuProps) {
  const [mode, setMode] = useState<"rename" | "move" | "delete" | null>(null);
  const [textValue, setTextValue] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null!);

  useEffect(() => {
    onDialogOpenChange?.(mode !== null);
  }, [mode, onDialogOpenChange]);

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
      <Menu isOpen={isOpen} onOpenChange={onOpenChange}>
        <MenuTrigger
          aria-label="Session options"
          className="absolute right-0 top-0 h-full w-auto items-center justify-end rounded-none pr-2.5 text-muted-fg opacity-0 pointer-events-none hover:text-foreground focus-visible:opacity-100 group-hover/sidebar-item:pointer-events-auto group-hover/sidebar-item:opacity-100 group-focus-visible/sidebar-item:pointer-events-auto group-focus-visible/sidebar-item:opacity-100"
        >
          <EllipsisHorizontalIcon />
        </MenuTrigger>
        <MenuContent popover={{ placement: "bottom end" }} className="w-44">
          <MenuItem
            textValue="Rename"
            onAction={() => {
              onOpenChange(false);
              setMode("rename");
            }}
          >
            <PencilLineIcon />
            Rename
          </MenuItem>
          <MenuItem
            textValue="Move"
            onAction={() => {
              onOpenChange(false);
              setMode("move");
            }}
          >
            <FolderInputIcon />
            Move
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            textValue="Delete"
            intent="danger"
            onAction={() => {
              onOpenChange(false);
              setMode("delete");
            }}
          >
            <TrashIcon />
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>

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
