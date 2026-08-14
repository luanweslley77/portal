import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { IconGridPlus } from "@/components/icons/lucide";
import { Button } from "@/components/ui/button";
import { Keyboard } from "@/components/ui/keyboard";
import { Link } from "@/components/ui/link";
import { SessionActionsMenu } from "@/components/session-actions-menu";
import { toast } from "@/components/ui/toast";
import useMediaQuery from "@/hooks/use-media-query";
import {
  useSessions,
  useCreateSession,
  useDeleteSession,
  useUpdateSession,
  useMoveSession,
} from "@/hooks/use-opencode";
import type { Session } from "@opencode-ai/sdk/v2";

function truncateTitle(title: string, maxLength = 40): string {
  if (title.length <= maxLength) return title;
  const halfLength = Math.floor((maxLength - 3) / 2);
  return `${title.slice(0, halfLength)}...${title.slice(-halfLength)}`;
}

export default function EmptyState() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { isMobile } = useMediaQuery();
  const { data: sessionsData, error, isLoading, mutate } = useSessions();
  const createSession = useCreateSession();
  const deleteSession = useDeleteSession();
  const updateSession = useUpdateSession();
  const moveSession = useMoveSession();

  const sessions: Session[] = sessionsData ?? [];

  const handleNewSession = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    try {
      const newSession = await createSession();
      await mutate();
      navigate({ to: "/session/$id", params: { id: newSession.id } });
    } catch (err) {
      console.error("Failed to create session:", err);
    } finally {
      setCreating(false);
    }
  }, [creating, createSession, mutate, navigate]);

  async function handleDeleteSession(sessionId: string) {
    try {
      await deleteSession(sessionId);
      await mutate();
      toast.success("Session deleted");
    } catch (err) {
      console.error("Failed to delete session:", err);
      toast.error("Failed to delete session");
    }
  }

  async function handleRenameSession(sessionId: string, title: string) {
    await updateSession(sessionId, title);
    await mutate();
  }

  async function handleMoveSession(sessionId: string, directory: string) {
    await moveSession(sessionId, directory);
    await mutate();
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Enter" && event.shiftKey && !creating) {
        event.preventDefault();
        handleNewSession();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [creating, handleNewSession]);

  if (isMobile) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-col items-center pt-8 pb-6">
          <div className="flex items-center gap-x-2 mb-2">
            <img src="/logo.svg" alt="OpenCode Portal" className="size-8" />
            <h2 className="text-2xl font-medium text-fg">
              OpenCode <span className="text-muted-fg">Portal</span>
            </h2>
          </div>
        </div>

        <div className="px-4 pb-4">
          <Button
            intent="outline"
            onPress={handleNewSession}
            isDisabled={creating}
            className="w-full"
          >
            <IconGridPlus className="shrink-0" />
            {creating ? "Creating..." : "New Session"}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-4">
          <h3 className="text-sm font-medium text-muted-fg mb-2">Sessions</h3>

          {isLoading && (
            <p className="text-sm text-muted-fg py-2">Loading sessions...</p>
          )}

          {error && (
            <p className="text-sm text-danger py-2">Error: {error.message}</p>
          )}

          {!isLoading && !error && sessions.length === 0 && (
            <p className="text-sm text-muted-fg py-2">No sessions found</p>
          )}

          {!isLoading && !error && sessions.length > 0 && (
            <ul className="space-y-1">
              {sessions.map((session) => (
                <li
                  key={session.id}
                  className="group relative flex items-center rounded-lg hover:bg-secondary/50 transition-colors"
                  onContextMenu={(e) => {
                    if (dialogOpen) return;
                    e.preventDefault();
                    setMenuSessionId(session.id);
                  }}
                >
                  <Link
                    href={`/session/${session.id}`}
                    className="min-w-0 flex-1 truncate py-2 pl-3 pr-8 text-sm"
                  >
                    {truncateTitle(
                      session.title || `Session ${session.id.slice(0, 8)}`,
                    )}
                  </Link>
                  <SessionActionsMenu
                    sessionId={session.id}
                    sessionTitle={
                      session.title || `Session ${session.id.slice(0, 8)}`
                    }
                    isOpen={menuSessionId === session.id}
                    onOpenChange={(open) =>
                      setMenuSessionId(open ? session.id : null)
                    }
                    onDelete={handleDeleteSession}
                    onRename={handleRenameSession}
                    onMove={handleMoveSession}
                    onDialogOpenChange={setDialogOpen}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center max-w-md">
        <div className="flex items-center justify-center gap-x-2 mb-4">
          <img src="/logo.svg" alt="OpenCode Portal" className="size-10" />
          <h2 className="text-2xl font-medium text-fg">OpenCode Portal</h2>
        </div>
        <p className="text-muted-fg mb-6">
          Select an existing session from the left panel or create a new one to
          get started
        </p>
        <div className="text-sm text-muted-fg">
          Press{" "}
          <Keyboard className="inline-flex px-1.5 py-0.5 rounded bg-secondary text-secondary-fg text-xs font-mono">
            Shift + Enter
          </Keyboard>{" "}
          to start a new session
        </div>
      </div>
    </div>
  );
}
