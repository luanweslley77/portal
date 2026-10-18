import { defineHandler, HTTPError } from "nitro/h3";
import { getOpencodeClient } from "../../../lib/opencode-client";
import { runGit, runGitOrEmpty } from "../../../lib/git";
import { parsePort } from "../../../lib/validation";

const FORMAT = [
  "%(refname)",
  "%(refname:short)",
  "%(objectname:short)",
  "%(committerdate:iso-strict)",
  "%(subject)",
].join("%09");

interface GitBranchInfo {
  name: string;
  kind: "local" | "remote";
  sha: string;
  date: string;
  subject: string;
}

export default defineHandler(async (event) => {
  const port = parsePort(event);

  try {
    const client = getOpencodeClient(port);
    const project = await client.project.current();

    if (!project.data?.worktree) {
      throw new HTTPError("No project worktree found", { status: 404 });
    }

    const worktree = project.data.worktree;

    const [currentResult, refsResult, originHeadResult] = await Promise.all([
      runGit(worktree, ["branch", "--show-current"]),
      runGit(worktree, [
        "for-each-ref",
        `--format=${FORMAT}`,
        "refs/heads",
        "refs/remotes",
      ]),
      runGitOrEmpty(worktree, [
        "symbolic-ref",
        "--short",
        "refs/remotes/origin/HEAD",
      ]),
    ]);

    const currentBranch = currentResult.stdout.trim();
    const originHead = originHeadResult.stdout.trim();

    const branches: GitBranchInfo[] = refsResult.stdout
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => line.split("\t"))
      .filter(([ref]) => !ref.endsWith("/HEAD"))
      .map(
        ([ref, name = "", sha = "", date = "", ...subject]): GitBranchInfo => ({
          name,
          kind: ref.startsWith("refs/heads/") ? "local" : "remote",
          sha,
          date,
          subject: subject.join("\t"),
        }),
      );

    branches.sort((a, b) => {
      const aCurrent = a.kind === "local" && a.name === currentBranch;
      const bCurrent = b.kind === "local" && b.name === currentBranch;
      if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;
      if (a.kind !== b.kind) return a.kind === "local" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const names = new Set(branches.map((branch) => branch.name));
    const defaultBase =
      ["main", "origin/main", "fork/main"].find((name) => names.has(name)) ??
      (originHead && names.has(originHead) ? originHead : undefined) ??
      branches.find(
        (branch) => branch.kind === "local" && branch.name !== currentBranch,
      )?.name ??
      currentBranch;

    return {
      worktree,
      currentBranch,
      defaults: { base: defaultBase },
      branches,
    };
  } catch (error) {
    if (error instanceof HTTPError) throw error;
    const err = error as { stderr?: string; message?: string };
    throw new HTTPError(
      err.stderr || err.message || "Failed to list git branches",
      { status: 500 },
    );
  }
});
