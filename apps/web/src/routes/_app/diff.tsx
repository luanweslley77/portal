import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FileDiff } from "@pierre/diffs/react";
import {
  parsePatchFiles,
  type ChangeTypes,
  type FileDiffMetadata,
} from "@pierre/diffs";
import { Loader } from "@/components/ui/loader";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useBackend, useGitBranches, useGitDiff } from "@/hooks/use-opencode";
import {
  DEFAULT_GIT_DIFF_MODE,
  GIT_WORKTREE_REF,
  type GitDiffMode,
} from "@/lib/git-refs";
import { useBreadcrumb } from "@/contexts/breadcrumb-context";
import useMediaQuery from "@/hooks/use-media-query";
import { twMerge } from "tailwind-merge";
import {
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  IconGitBranch,
  ListTreeIcon,
} from "@/components/icons/lucide";

export const Route = createFileRoute("/_app/diff")({
  component: DiffPage,
});

type DiffMode = "worktree" | "branches";
type CompareStyle = GitDiffMode;

const TREE_STORAGE_KEY = "portal-diff-tree-open";
const CONTROLS_STORAGE_KEY = "portal-diff-branch-controls-open";

function readStoredFlag(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

function storeFlag(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {}
}

interface DiffTreeFileEntry {
  path: string;
  prevName?: string;
  name: string;
  index: number;
  type: ChangeTypes;
  additions: number;
  deletions: number;
}

interface DiffTreeDirectory {
  name: string;
  path: string;
  directories: DiffTreeDirectory[];
  files: DiffTreeFileEntry[];
}

const CHANGE_LABELS: Record<ChangeTypes, { label: string; className: string }> =
  {
    change: { label: "M", className: "text-warning" },
    new: { label: "A", className: "text-success" },
    deleted: { label: "D", className: "text-danger" },
    "rename-pure": { label: "R", className: "text-muted-fg" },
    "rename-changed": { label: "R", className: "text-muted-fg" },
  };

function buildDiffTree(files: FileDiffMetadata[]): DiffTreeDirectory {
  const root: DiffTreeDirectory = {
    name: "",
    path: "",
    directories: [],
    files: [],
  };

  files.forEach((file, index) => {
    const path = file.name || file.prevName || `file-${index}`;
    const segments = path.split("/").filter(Boolean);
    const fileName = segments.pop() ?? path;
    let directory = root;

    for (const segment of segments) {
      let child = directory.directories.find((entry) => entry.name === segment);
      if (!child) {
        child = {
          name: segment,
          path: directory.path ? `${directory.path}/${segment}` : segment,
          directories: [],
          files: [],
        };
        directory.directories.push(child);
      }
      directory = child;
    }

    let additions = 0;
    let deletions = 0;
    for (const hunk of file.hunks ?? []) {
      additions += hunk.additionLines;
      deletions += hunk.deletionLines;
    }

    directory.files.push({
      path,
      prevName: file.prevName,
      name: fileName,
      index,
      type: file.type,
      additions,
      deletions,
    });
  });

  const sortDirectory = (directory: DiffTreeDirectory) => {
    directory.directories.sort((a, b) => a.name.localeCompare(b.name));
    directory.files.sort((a, b) => a.name.localeCompare(b.name));
    directory.directories.forEach(sortDirectory);
  };
  sortDirectory(root);

  return root;
}

interface DiffTreeProps {
  directory: DiffTreeDirectory;
  depth?: number;
  collapsed: Set<string>;
  activeIndex: number | null;
  onToggleDirectory: (path: string) => void;
  onSelectFile: (index: number) => void;
}

function DiffTree({
  directory,
  depth = 0,
  collapsed,
  activeIndex,
  onToggleDirectory,
  onSelectFile,
}: DiffTreeProps) {
  return (
    <>
      {directory.directories.map((child) => {
        const isCollapsed = collapsed.has(child.path);
        return (
          <div key={`dir:${child.path}`}>
            <button
              type="button"
              aria-expanded={!isCollapsed}
              onClick={() => onToggleDirectory(child.path)}
              className="flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs text-muted-fg hover:bg-muted hover:text-fg"
              style={{ paddingLeft: depth * 12 + 8 }}
            >
              <ChevronDownIcon
                className={twMerge(
                  "size-3.5 shrink-0 transition-transform",
                  isCollapsed && "-rotate-90",
                )}
              />
              <FolderIcon className="size-3.5 shrink-0" />
              <span className="truncate">{child.name}</span>
            </button>
            {!isCollapsed && (
              <DiffTree
                directory={child}
                depth={depth + 1}
                collapsed={collapsed}
                activeIndex={activeIndex}
                onToggleDirectory={onToggleDirectory}
                onSelectFile={onSelectFile}
              />
            )}
          </div>
        );
      })}
      {directory.files.map((file) => {
        const change = CHANGE_LABELS[file.type] ?? CHANGE_LABELS.change;
        const isActive = file.index === activeIndex;
        return (
          <button
            key={`file:${file.path}:${file.index}`}
            type="button"
            data-file-index={file.index}
            onClick={() => onSelectFile(file.index)}
            title={
              file.prevName && file.prevName !== file.path
                ? `${file.prevName} → ${file.path}`
                : file.path
            }
            className={twMerge(
              "flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs",
              isActive
                ? "bg-muted text-fg"
                : "text-muted-fg hover:bg-muted hover:text-fg",
            )}
            style={{ paddingLeft: depth * 12 + 26 }}
          >
            <span
              className={twMerge(
                "w-3 shrink-0 font-mono font-semibold text-[10px]",
                change.className,
              )}
            >
              {change.label}
            </span>
            <span className="truncate">{file.name}</span>
            <span className="ml-auto flex shrink-0 items-center gap-1 font-mono text-[10px]">
              {file.additions > 0 && (
                <span className="text-success">+{file.additions}</span>
              )}
              {file.deletions > 0 && (
                <span className="text-danger">-{file.deletions}</span>
              )}
            </span>
          </button>
        );
      })}
    </>
  );
}

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
  const [treeOpen, setTreeOpen] = useState(() =>
    readStoredFlag(TREE_STORAGE_KEY, true),
  );
  const [treeSheetOpen, setTreeSheetOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(() =>
    readStoredFlag(CONTROLS_STORAGE_KEY, true),
  );
  const [collapsedDirectories, setCollapsedDirectories] = useState<Set<string>>(
    new Set(),
  );
  const [activeFileIndex, setActiveFileIndex] = useState<number | null>(null);

  const { isMobile, isTablet } = useMediaQuery();
  const usesTreeSheet = isMobile || isTablet;

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

  const tree = useMemo(() => buildDiffTree(files), [files]);
  const activeFile =
    activeFileIndex !== null && activeFileIndex < files.length
      ? activeFileIndex
      : null;

  useEffect(() => {
    setActiveFileIndex(null);
  }, [files]);

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

  function handleToggleTree() {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setTreeOpen((current) => {
        const next = !current;
        storeFlag(TREE_STORAGE_KEY, next);
        return next;
      });
      return;
    }
    setTreeSheetOpen(true);
  }

  function handleToggleControls() {
    setControlsOpen((current) => {
      const next = !current;
      storeFlag(CONTROLS_STORAGE_KEY, next);
      return next;
    });
  }

  function handleToggleDirectory(path: string) {
    setCollapsedDirectories((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function handleSelectFile(index: number) {
    setActiveFileIndex(index);
    setTreeSheetOpen(false);
    requestAnimationFrame(() => {
      document
        .getElementById(`diff-file-${index}`)
        ?.scrollIntoView({ block: "start", inline: "nearest" });
    });
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
      <div
        id={`diff-file-${index}`}
        data-slot="diff-file"
        key={file.name || file.prevName || index}
      >
        <FileDiff
          fileDiff={file}
          options={{
            diffStyle: "unified",
            diffIndicators: "bars",
            overflow: "wrap",
          }}
        />
      </div>
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
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h1 className="text-lg font-semibold">Git Diff</h1>
        <div className="flex items-center gap-1.5">
          <Button
            intent={
              (usesTreeSheet ? treeSheetOpen : treeOpen) ? "secondary" : "plain"
            }
            size="sm"
            onPress={handleToggleTree}
            isDisabled={files.length === 0}
            aria-label="Toggle file tree"
          >
            <ListTreeIcon className="size-4" />
            <span className="hidden sm:inline">Files</span>
            {files.length > 0 && (
              <span className="text-xs text-muted-fg">{files.length}</span>
            )}
          </Button>
          <Button intent="secondary" size="sm" onPress={handleRefresh}>
            <ArrowPathIcon className="size-4" />
            Refresh
          </Button>
        </div>
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
          {mode === "branches" && (
            <>
              {!controlsOpen && (
                <span className="hidden min-w-0 flex-1 truncate pl-1 text-xs text-muted-fg sm:inline">
                  {base || "…"} → {head || "…"}
                </span>
              )}
              <Button
                size="sm"
                intent="plain"
                className="ml-auto shrink-0"
                aria-expanded={controlsOpen}
                aria-label={
                  controlsOpen
                    ? "Hide branch selection"
                    : "Show branch selection"
                }
                onPress={handleToggleControls}
              >
                <ChevronDownIcon
                  className={twMerge(
                    "size-4 transition-transform",
                    !controlsOpen && "-rotate-90",
                  )}
                />
                <span className="hidden sm:inline">Compare</span>
              </Button>
            </>
          )}
        </div>
      )}

      {supportsBranches && mode === "branches" && !controlsOpen && (
        <div className="flex items-center gap-2 border-b border-border px-4 py-1.5 sm:hidden">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-fg">
            {base || "…"} → {head || "…"}
          </span>
          {meta && (
            <span className="shrink-0 text-xs text-muted-fg">{meta}</span>
          )}
        </div>
      )}

      {supportsBranches && mode === "branches" && controlsOpen && (
        <div
          data-slot="diff-branch-controls"
          className="space-y-2 border-b border-border px-4 py-3"
        >
          {renderBranchControls()}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {treeOpen && files.length > 0 && (
          <aside
            data-slot="diff-tree"
            className="hidden w-60 shrink-0 flex-col border-r border-border lg:flex"
          >
            <div className="flex h-9 shrink-0 items-center border-b border-border px-3">
              <span className="text-xs font-medium text-muted-fg">
                {files.length} file{files.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-1">
              <DiffTree
                directory={tree}
                collapsed={collapsedDirectories}
                activeIndex={activeFile}
                onToggleDirectory={handleToggleDirectory}
                onSelectFile={handleSelectFile}
              />
            </div>
          </aside>
        )}

        <div data-slot="diff-scroll" className="min-w-0 flex-1 overflow-auto">
          {renderContent()}
        </div>
      </div>

      <Sheet isOpen={treeSheetOpen} onOpenChange={setTreeSheetOpen}>
        <SheetContent side="left" aria-label="Changed files" className="w-80">
          <SheetHeader>
            <SheetTitle>Changed files</SheetTitle>
          </SheetHeader>
          <SheetBody className="p-1">
            <DiffTree
              directory={tree}
              collapsed={collapsedDirectories}
              activeIndex={activeFile}
              onToggleDirectory={handleToggleDirectory}
              onSelectFile={handleSelectFile}
            />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
}
