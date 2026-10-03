import { useState } from "react";
import { ModalOverlay, Modal } from "react-aria-components";
import { Loader } from "@/components/ui/loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  useMcpStatus,
  useToggleMcp,
} from "@/hooks/use-opencode";
import type { McpStatus } from "@opencode-ai/sdk/v2";

const MCP_STATUS_LABEL: Record<McpStatus["status"], string> = {
  connected: "Connected",
  disabled: "Disabled in configuration",
  failed: "Failed",
  needs_auth: "Needs authentication",
  needs_client_registration: "Needs client registration",
};

export function McpDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: mcpData, isLoading, mutate } = useMcpStatus();
  const toggleMcp = useToggleMcp();
  const [busyName, setBusyName] = useState<string | null>(null);

  const entries = Object.entries(mcpData ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  const handleToggle = async (name: string, status: McpStatus) => {
    if (busyName) return;
    setBusyName(name);
    try {
      await toggleMcp(name, status.status === "connected");
      await mutate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to toggle MCP server",
      );
    } finally {
      setBusyName(null);
    }
  };

  const modalClass =
    "fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4";
  const dialogClass =
    "w-full max-w-sm rounded-xl border border-border bg-bg shadow-2xl outline-hidden";

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className={modalClass}
    >
      <Modal className="outline-hidden">
        <div className={dialogClass}>
          <div className="px-5 pt-4 pb-2">
            <h2 className="text-lg font-semibold text-fg">MCP Servers</h2>
            <p className="mt-1 text-sm text-muted-fg">
              Enable or disable MCP servers.
            </p>
          </div>
          <div className="max-h-80 overflow-y-auto px-5 py-3">
            {isLoading && (
              <div className="flex items-center justify-center py-6">
                <Loader className="size-5" />
              </div>
            )}
            {!isLoading && entries.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-fg">
                No MCP servers
              </p>
            )}
            {entries.map(([name, status]) => (
              <div
                key={name}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{name}</p>
                  <p className="truncate text-xs text-muted-fg">
                    {status.status === "failed"
                      ? status.error
                      : MCP_STATUS_LABEL[status.status]}
                  </p>
                </div>
                <Badge
                  intent={
                    status.status === "connected"
                      ? "success"
                      : status.status === "failed"
                        ? "danger"
                        : "secondary"
                  }
                  className="shrink-0"
                >
                  {status.status === "connected" ? "Enabled" : "Disabled"}
                </Badge>
                <Button
                  size="sm"
                  intent={status.status === "connected" ? "danger" : "primary"}
                  isDisabled={busyName !== null}
                  onPress={() => void handleToggle(name, status)}
                >
                  {busyName === name ? (
                    <Loader className="size-3.5" />
                  ) : status.status === "connected" ? (
                    "Disable"
                  ) : (
                    "Enable"
                  )}
                </Button>
              </div>
            ))}
          </div>
          <div className="flex justify-end px-5 py-4 pt-2">
            <Button intent="plain" onPress={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </ModalOverlay>
  );
}
