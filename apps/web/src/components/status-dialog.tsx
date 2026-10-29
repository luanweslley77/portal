import { useMemo } from "react";
import { ModalOverlay, Modal } from "react-aria-components";
import { Loader } from "@/components/ui/loader";
import { Button } from "@/components/ui/button";
import {
  useMcpStatus,
  useLspStatus,
  useFormatterStatus,
  useConfig,
} from "@/hooks/use-opencode";
import type { McpStatus } from "@opencode-ai/sdk/v2";

const MCP_STATUS_LABEL: Record<McpStatus["status"], string> = {
  connected: "Connected",
  disabled: "Disabled in configuration",
  failed: "Failed",
  needs_auth: "Needs authentication",
  needs_client_registration: "Needs client registration",
};

function pluginName(plugin: string | [string, unknown]): string {
  const value = typeof plugin === "string" ? plugin : plugin[0];
  if (value.startsWith("file://")) {
    const parts = value.split("/");
    const filename = parts.pop() || value;
    if (!filename.includes(".")) return filename;
    const basename = filename.split(".")[0];
    if (basename === "index") {
      const dirname = parts.pop();
      return dirname || basename;
    }
    return basename;
  }
  const index = value.lastIndexOf("@");
  if (index <= 0) return value;
  return value.substring(0, index);
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "connected"
      ? "bg-success"
      : status === "failed" || status === "error"
        ? "bg-danger"
        : status === "needs_auth"
          ? "bg-warning"
          : "bg-muted-fg/40";
  return <span className={`mt-1.5 size-2 shrink-0 rounded-full ${color}`} />;
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="py-2">
      <p className="text-xs font-medium text-muted-fg">{title}</p>
      {count === 0 ? (
        <p className="py-1 text-sm text-muted-fg">None</p>
      ) : (
        <div className="space-y-1">{children}</div>
      )}
    </div>
  );
}

export function StatusDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: mcpData, isLoading: mcpLoading } = useMcpStatus();
  const { data: lspData, isLoading: lspLoading } = useLspStatus();
  const { data: formatterData, isLoading: formatterLoading } =
    useFormatterStatus();
  const { data: configData, isLoading: configLoading } = useConfig();

  const mcpEntries = Object.entries(mcpData ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const plugins = useMemo(() => {
    const list = configData?.plugin ?? [];
    return list
      .map((plugin) => ({
        name: pluginName(plugin),
        version:
          typeof plugin === "string" && plugin.includes("@")
            ? plugin.slice(plugin.lastIndexOf("@") + 1)
            : undefined,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [configData]);

  const loading =
    mcpLoading || lspLoading || formatterLoading || configLoading;

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
            <h2 className="text-lg font-semibold text-fg">Status</h2>
            <p className="mt-1 text-sm text-muted-fg">
              MCP, LSP, formatters and plugins.
            </p>
          </div>
          <div className="max-h-80 overflow-y-auto px-5 py-3">
            {loading && (
              <div className="flex items-center justify-center py-6">
                <Loader className="size-5" />
              </div>
            )}
            {!loading && (
              <>
                <Section title="MCP Servers" count={mcpEntries.length}>
                  {mcpEntries.map(([name, status]) => (
                    <div
                      key={name}
                      className="flex items-center gap-2 text-sm"
                    >
                      <StatusDot status={status.status} />
                      <span className="min-w-0 truncate font-medium text-fg">
                        {name}
                      </span>
                      <span className="min-w-0 truncate text-xs text-muted-fg">
                        {status.status === "failed"
                          ? status.error
                          : MCP_STATUS_LABEL[status.status]}
                      </span>
                    </div>
                  ))}
                </Section>
                <Section title="LSP Servers" count={(lspData ?? []).length}>
                  {(lspData ?? []).map((lsp) => (
                    <div key={lsp.id} className="flex items-center gap-2 text-sm">
                      <StatusDot status={lsp.status} />
                      <span className="min-w-0 truncate font-medium text-fg">
                        {lsp.name || lsp.id}
                      </span>
                      <span className="min-w-0 truncate text-xs text-muted-fg">
                        {lsp.root}
                      </span>
                    </div>
                  ))}
                </Section>
                <Section
                  title="Formatters"
                  count={(formatterData ?? []).filter((f) => f.enabled).length}
                >
                  {(formatterData ?? [])
                    .filter((f) => f.enabled)
                    .map((formatter) => (
                      <div
                        key={formatter.name}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-success" />
                        <span className="truncate font-medium text-fg">
                          {formatter.name}
                        </span>
                      </div>
                    ))}
                </Section>
                <Section title="Plugins" count={plugins.length}>
                  {plugins.map((plugin) => (
                    <div key={plugin.name} className="flex items-center gap-2 text-sm">
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-success" />
                      <span className="truncate font-medium text-fg">
                        {plugin.name}
                      </span>
                      {plugin.version && (
                        <span className="shrink-0 text-xs text-muted-fg">
                          @{plugin.version}
                        </span>
                      )}
                    </div>
                  ))}
                </Section>
              </>
            )}
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
