import { useMemo, useState } from "react";
import { useMatch, useNavigate } from "@tanstack/react-router";
import { Breadcrumbs, BreadcrumbsItem } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { SidebarNav, SidebarTrigger } from "@/components/ui/sidebar";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import {
  ArrowDownCircleIcon,
  ArrowUpCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  IconGitBranch,
  IconGitPullRequest,
  ListTreeIcon,
} from "@/components/icons/lucide";
import { useInstanceStore } from "@/stores/instance-store";
import { useModelStore } from "@/stores/model-store";
import { useBreadcrumb } from "@/contexts/breadcrumb-context";
import { mutateSessionMessages } from "@/hooks/use-session-messages";
import { useSessions } from "@/hooks/use-opencode";
import { backendBasePath } from "@/lib/backend-url";
import type { Session } from "@opencode-ai/sdk/v2";

const CREATE_PR_PROMPT = `Use gh CLI to create a pull request. Follow these steps:

1. First, check git status to see all changes
2. Stage all relevant changes with git add
3. Get the diff of staged changes
4. Generate a clear, descriptive commit message based on the changes
5. Commit the changes
6. Push to the remote branch (create branch if needed)
7. Create a PR using gh pr create with a descriptive title and body
8. After the PR is created, checkout to main branch

Make sure to:
- Write a meaningful commit message that explains WHY, not just WHAT
- The PR title should be concise but descriptive
- The PR body should summarize the changes and their purpose
- Always checkout to main after successfully creating the PR`;

const PULL_CHANGES_PROMPT = `Pull the latest changes from the remote repository. Follow these steps:

1. First, check git status to see if there are any uncommitted changes
2. If there are uncommitted changes, stash them with a descriptive message
3. Run git pull to fetch and merge the latest changes from the remote
4. If there were stashed changes, pop the stash and resolve any conflicts if needed
5. Show a summary of what was pulled (new commits, files changed)

Make sure to:
- Handle any merge conflicts gracefully
- Report what changes were pulled
- Restore any stashed changes after pulling`;

const PUSH_CHANGES_PROMPT = `Push the current changes to the remote repository. Follow these steps:

1. First, check git status to see all uncommitted changes
2. If there are uncommitted changes:
   - Stage all relevant changes with git add
   - Generate a clear, descriptive commit message based on the changes
   - Commit the changes
3. Check if the current branch has an upstream branch set
4. Push to the remote (set upstream if needed)
5. Show a summary of what was pushed

Make sure to:
- Write a meaningful commit message that explains WHY, not just WHAT
- Handle any push rejections (e.g., if remote has new commits, pull first)
- Report the result of the push operation`;

function findRoot(sessions: Session[], currentId: string): Session | undefined {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  let node = byId.get(currentId);
  if (!node) return undefined;
  while (node.parentID && byId.has(node.parentID)) {
    node = byId.get(node.parentID)!;
  }
  return node;
}

function childrenOf(sessions: Session[], parentId: string): Session[] {
  return sessions
    .filter((session) => session.parentID === parentId)
    .sort(
      (a: Session, b: Session) =>
        (b.time.updated ?? b.time.created) -
        (a.time.updated ?? a.time.created),
    );
}

interface SessionTreeNodeProps {
  session: Session;
  depth: number;
  sessions: Session[];
  currentId: string;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}

function SessionTreeNode({
  session,
  depth,
  sessions,
  currentId,
  collapsed,
  onToggle,
  onSelect,
}: SessionTreeNodeProps) {
  const childSessions = childrenOf(sessions, session.id);
  const hasChildren = childSessions.length > 0;
  const isCollapsed = collapsed.has(session.id);
  const isCurrent = session.id === currentId;

  return (
    <>
      <div
        className="flex items-center gap-x-1"
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        {hasChildren ? (
          <Button
            size="sq-xs"
            intent="plain"
            className="shrink-0"
            aria-label={isCollapsed ? "Expand session" : "Collapse session"}
            onPress={() => onToggle(session.id)}
          >
            {isCollapsed ? (
              <ChevronRightIcon size="14px" />
            ) : (
              <ChevronDownIcon size="14px" />
            )}
          </Button>
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center sm:size-7">
            <span className="size-1.5 rounded-full bg-muted-fg/40" />
          </span>
        )}
        <Button
          intent={isCurrent ? "secondary" : "plain"}
          className="min-w-0 flex-1 justify-start rounded-lg px-2 py-1.5 text-sm"
          onPress={() => onSelect(session.id)}
        >
          <span className="truncate">
            {session.title || `Session ${session.id.slice(0, 8)}`}
          </span>
        </Button>
      </div>
      {hasChildren &&
        !isCollapsed &&
        childSessions.map((child) => (
          <SessionTreeNode
            key={child.id}
            session={child}
            depth={depth + 1}
            sessions={sessions}
            currentId={currentId}
            collapsed={collapsed}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

export function AppSidebarNav() {
  const instance = useInstanceStore((s) => s.instance);
  const port = instance?.port ?? 0;
  const provider = instance?.provider;
  const apiBase = port ? backendBasePath(provider, port) : "";
  const { pageTitle } = useBreadcrumb();
  const selectedModel = useModelStore((s) => s.selectedModel);
  const { mutate: mutateSessions } = useSessions();

  const [isCreatingPR, setIsCreatingPR] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isGitOpen, setIsGitOpen] = useState(false);
  const [isTasksOpen, setIsTasksOpen] = useState(false);
  const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const { data: sessionsData, isLoading: isLoadingSessions } = useSessions();
  const sessions: Session[] = sessionsData ?? [];

  const sessionMatch = useMatch({
    from: "/_app/session/$id",
    shouldThrow: false,
  });
  const sessionId = sessionMatch?.params?.id;

  const rootSession = useMemo(
    () => (sessionId ? findRoot(sessions, sessionId) : undefined),
    [sessions, sessionId],
  );

  const handleSelectSession = (id: string) => {
    setIsTasksOpen(false);
    navigate({ to: "/session/$id", params: { id } });
  };

  const toggleCollapsed = (id: string) => {
    setCollapsedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sendPrompt = async (prompt: string) => {
    if (!sessionId || !port) {
      toast.error("Please open a session first");
      return;
    }

    const response = await fetch(`${apiBase}/session/${sessionId}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: prompt,
        model:
          selectedModel.providerID && selectedModel.modelID
            ? selectedModel
            : undefined,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to send request");
    }

    mutateSessionMessages(port, sessionId, provider);
    mutateSessions();
  };

  const handleCreatePR = async () => {
    setIsCreatingPR(true);
    try {
      await sendPrompt(CREATE_PR_PROMPT);
      toast.success("PR creation request sent");
      setIsGitOpen(false);
    } catch (err) {
      console.error("Failed to create PR:", err);
      toast.error("Failed to send PR creation request");
    } finally {
      setIsCreatingPR(false);
    }
  };

  const handlePull = async () => {
    setIsPulling(true);
    try {
      await sendPrompt(PULL_CHANGES_PROMPT);
      toast.success("Pull request sent");
      setIsGitOpen(false);
    } catch (err) {
      console.error("Failed to pull:", err);
      toast.error("Failed to send pull request");
    } finally {
      setIsPulling(false);
    }
  };

  const handlePush = async () => {
    setIsPushing(true);
    try {
      await sendPrompt(PUSH_CHANGES_PROMPT);
      toast.success("Push request sent");
      setIsGitOpen(false);
    } catch (err) {
      console.error("Failed to push:", err);
      toast.error("Failed to send push request");
    } finally {
      setIsPushing(false);
    }
  };

  const isLoading = isCreatingPR || isPulling || isPushing;

  return (
    <SidebarNav isSticky>
      <span className="flex items-center gap-x-4">
        <SidebarTrigger className="-ml-2" />
        <Breadcrumbs className="hidden md:flex">
          <BreadcrumbsItem href="/">
            {instance?.name ?? "Instance"}
          </BreadcrumbsItem>
          {pageTitle && <BreadcrumbsItem>{pageTitle}</BreadcrumbsItem>}
        </Breadcrumbs>
      </span>
      <span className="flex items-center gap-x-2 ml-auto">
        {sessionId && (
          <Button
            size="xs"
            intent="outline"
            className="uppercase font-mono"
            onPress={() => setIsTasksOpen(true)}
          >
            <ListTreeIcon size="14px" />
            Tasks
          </Button>
        )}
        <Button
          size="xs"
          intent="outline"
          className="uppercase font-mono"
          onPress={() => setIsGitOpen(true)}
          isDisabled={!sessionId}
        >
          <IconGitBranch size="14px" />
          Git
        </Button>
      </span>
      <Sheet isOpen={isTasksOpen} onOpenChange={setIsTasksOpen}>
        <SheetContent side="right" aria-label="Tasks" className="sm:max-w-96">
          <SheetHeader>
            <SheetTitle>Tasks</SheetTitle>
            {rootSession && (
              <SheetDescription>{rootSession.title}</SheetDescription>
            )}
          </SheetHeader>
          <SheetBody className="gap-1">
            {isLoadingSessions ? (
              <p className="px-3 py-2 text-sm text-muted-fg">
                Loading sessions...
              </p>
            ) : !rootSession ? (
              <p className="px-3 py-2 text-sm text-muted-fg">
                No session found
              </p>
            ) : (
              <SessionTreeNode
                session={rootSession}
                depth={0}
                sessions={sessions}
                currentId={sessionId ?? ""}
                collapsed={collapsedTasks}
                onToggle={toggleCollapsed}
                onSelect={handleSelectSession}
              />
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
      <Sheet isOpen={isGitOpen} onOpenChange={setIsGitOpen}>
        <SheetContent side="right" aria-label="Git">
          <SheetHeader>
            <SheetTitle>Git</SheetTitle>
          </SheetHeader>
          <SheetBody className="gap-1">
            <Button
              intent="plain"
              className="justify-start gap-x-3 px-3 py-2.5 rounded-xl h-auto"
              onPress={handlePull}
              isDisabled={isLoading || !sessionId}
            >
              <ArrowDownCircleIcon size="18px" />
              <span className="flex flex-col items-start">
                <span className="uppercase font-mono text-sm">
                  {isPulling ? "Pulling..." : "Pull"}
                </span>
                <span className="text-xs text-muted-fg normal-case font-sans">
                  Fetch and merge latest remote changes
                </span>
              </span>
            </Button>
            <Button
              intent="plain"
              className="justify-start gap-x-3 px-3 py-2.5 rounded-xl h-auto"
              onPress={handlePush}
              isDisabled={isLoading || !sessionId}
            >
              <ArrowUpCircleIcon size="18px" />
              <span className="flex flex-col items-start">
                <span className="uppercase font-mono text-sm">
                  {isPushing ? "Pushing..." : "Push"}
                </span>
                <span className="text-xs text-muted-fg normal-case font-sans">
                  Commit and push changes to remote
                </span>
              </span>
            </Button>
            <Button
              intent="plain"
              className="justify-start gap-x-3 px-3 py-2.5 rounded-xl h-auto"
              onPress={handleCreatePR}
              isDisabled={isLoading || !sessionId}
            >
              <IconGitPullRequest size="18px" />
              <span className="flex flex-col items-start">
                <span className="uppercase font-mono text-sm">
                  {isCreatingPR ? "Creating..." : "Create PR"}
                </span>
                <span className="text-xs text-muted-fg normal-case font-sans">
                  Commit, push and open a pull request
                </span>
              </span>
            </Button>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </SidebarNav>
  );
}
