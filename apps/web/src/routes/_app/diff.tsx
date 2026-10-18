import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FileDiff } from "@pierre/diffs/react";
import { parsePatchFiles } from "@pierre/diffs";
import { Loader } from "@/components/ui/loader";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  useBackend,
  useGitBranches,
  useGitDiff,
} from "@/hooks/use-opencode";
import {
  DEFAULT_GIT_DIFF_MODE,
  GIT_WORKTREE_REF,
  type GitDiffMode,
} from "@/lib/git-refs";
import { useBreadcrumb } from "@/contexts/breadcrumb-context";
import {
  ArrowPathIcon,
  ChevronRightIcon,
  IconGitBranch,
} from "@/components/icons/lucide";

export const Route = createFileRoute("/_app/diff")({
  component: DiffPage,
});

type DiffMode = "worktree" | "branches";
type CompareStyle = GitDiffMode;

interface BranchSelectProps {
  label: string;
  prefix: string;
  value: string;
  names: string[];
  onChange: (value: string) => void;
}

function BranchSelect({
  label,
  prefix,
  value,
  names,
  onChange,
}: BranchSelectProps) {
  return (
    <Select
      aria-label={label}
      className="min-w-0 sm:flex-1"
      selectedKey={value || null}
      onSelectionChange={(key) => {
        if (key) onChange(String(key));
      }}
    >
      <SelectTrigger prefix={prefix} className="min-w-0" />
      <SelectContent>
        {names.map((name) => (
          <SelectItem key={name} id={name} textValue={name}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DiffPage() {
  const { setPageTitle } = useBreadcrumb();
  const backend = useBackend();
  const supportsBranches = backend?.provider === "opencode";

  const [mode, setMode] = useState<DiffMode>("worktree");
  const [style, setStyle] = useState<CompareStyle>(DEFAULT_GIT_DIFF_MODE);
  const [baseOverride, setBaseOverride] = useState<string | null>(null);
  const [headOverride, setHeadOverride] = useState<string | null>(null);

  const branchesQuery = useGitBranches(supportsBranches);
  const branchData = branchesQuery.data;

  useEffect(() => {
    if (!supportsBranches) setMode("worktree");
  }, [supportsBranches]);

  const branchNames = useMemo(
    () => (branchData?.branches ?? []).map((branch) => branch.name),
    [branchData?.branches],
  );

  const headNames = useMemo(
    () => [GIT_WORKTREE_REF, ...branchNames],
    [branchNames],
  );

  const baseOverrideValid =
    baseOverride && (!branchData || branchNames.includes(baseOverride))
      ? baseOverride
      : null;
  const headOverrideValid =
    headOverride &&
    (!branchData ||
      headOverride === GIT_WORKTREE_REF ||
      branchNames.includes(headOverride))
      ? headOverride
      : null;

  const base = baseOverrideValid || branchData?.defaults?.base || "";
  const head =
    headOverrideValid ||
    (branchData?.currentBranch && branchData.currentBranch !== base
      ? branchData.currentBranch
      : undefined) ||
    branchData?.branches?.find((branch) => branch.name !== base)?.name ||
    "";

  const compareReady = mode === "branches" && !!base && !!head;

  const diffQuery = useGitDiff(
    compareReady ? { from: base, to: head, mode: style } : null,
  );
  const { data, error, isLoading, mutate } = diffQuery;

  useEffect(() => {
    setPageTitle("Git Diff");
    return () => setPageTitle(null);
  }, [setPageTitle]);

  const files = useMemo(() => {
    if (!data?.diff) return [];
    try {
      const patches = parsePatchFiles(data.diff);
      return patches.flatMap((patch) => patch.files);
    } catch {
      return [];
    }
  }, [data?.diff]);

  const meta = useMemo(() => {
    if (!data?.from) return "";
    const parts: string[] = [];
    if (typeof data.commits === "number") {
      parts.push(`${data.commits} commit${data.commits === 1 ? "" : "s"}`);
    }
    if (data.mergeBase) {
      parts.push(`diverged at ${data.mergeBase.slice(0, 7)}`);
    }
    return parts.join(" • ");
  }, [data?.from, data?.commits, data?.mergeBase]);

  function handleRefresh() {
    void mutate();
    if (mode === "branches") {
      void branchesQuery.mutate();
    }
  }

  function renderContent() {
    if (mode === "branches" && !branchData) {
      return null;
    }

    if (mode === "branches" && !compareReady) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="text-muted-fg">No branches available to compare</div>
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="flex h-full items-center justify-center">
          <Loader className="size-8" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4">
          <div className="text-danger">Error loading diff: {error.message}</div>
          <Button onPress={() => mutate()}>
            <ArrowPathIcon className="size-4" />
            Retry
          </Button>
        </div>
      );
    }

    if (mode === "branches" && !data?.from) {
      return (
        <div className="flex h-full items-center justify-center">
          <Loader className="size-8" />
        </div>
      );
    }

    if (mode === "worktree" && data?.from) {
      return (
        <div className="flex h-full items-center justify-center">
          <Loader className="size-8" />
        </div>
      );
    }

    if (!data?.diff || files.length === 0) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4">
          <div className="text-muted-fg">
            {mode === "branches"
              ? `No changes between ${data?.from ?? base} and ${data?.to ?? head}`
              : "No uncommitted changes"}
          </div>
          <Button onPress={() => mutate()}>
            <ArrowPathIcon className="size-4" />
            Refresh
          </Button>
        </div>
      );
    }

    return files.map((file, index) => (
      <FileDiff
        key={file.name || file.prevName || index}
        fileDiff={file}
        options={{
          diffStyle: "unified",
          diffIndicators: "bars",
          overflow: "wrap",
        }}
      />
    ));
  }

  function renderBranchControls() {
    if (!branchData) {
      if (branchesQuery.isLoading) {
        return (
          <div className="flex justify-center py-2">
            <Loader className="size-5" />
          </div>
        );
      }
      return (
        <div className="text-xs text-danger">
          Error loading branches
          {branchesQuery.error ? `: ${branchesQuery.error.message}` : ""}
        </div>
      );
    }

    return (
      <>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <BranchSelect
            label="Base branch"
            prefix="base:"
            value={base}
            names={branchNames}
            onChange={setBaseOverride}
          />
          <ChevronRightIcon className="hidden size-4 shrink-0 text-muted-fg sm:block" />
          <BranchSelect
            label="Head branch"
            prefix="head:"
            value={head}
            names={headNames}
            onChange={setHeadOverride}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 truncate text-xs text-muted-fg">
            {meta ||
              `Read-only — working branch stays ${branchData.currentBranch || "unchanged"}`}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Button
              size="xs"
              intent={style === "merge" ? "secondary" : "plain"}
              onPress={() => setStyle("merge")}
            >
              Since divergence
            </Button>
            <Button
              size="xs"
              intent={style === "direct" ? "secondary" : "plain"}
              onPress={() => setStyle("direct")}
            >
              Full diff
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="-m-4 flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h1 className="text-lg font-semibold">Git Diff</h1>
        <Button intent="secondary" size="sm" onPress={handleRefresh}>
          <ArrowPathIcon className="size-4" />
          Refresh
        </Button>
      </div>

      {supportsBranches && (
        <div className="flex items-center gap-1.5 border-b border-border px-4 py-2">
          <Button
            size="sm"
            intent={mode === "worktree" ? "secondary" : "plain"}
            onPress={() => setMode("worktree")}
          >
            Working tree
          </Button>
          <Button
            size="sm"
            intent={mode === "branches" ? "secondary" : "plain"}
            onPress={() => setMode("branches")}
          >
            <IconGitBranch className="size-4" data-slot="icon" />
            Branches
          </Button>
        </div>
      )}

      {supportsBranches && mode === "branches" && (
        <div className="space-y-2 border-b border-border px-4 py-3">
          {renderBranchControls()}
        </div>
      )}

      <div className="flex-1 overflow-auto">{renderContent()}</div>
    </div>
  );
}
