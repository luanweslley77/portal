import { defineHandler, getQuery, HTTPError } from "nitro/h3";
import { getOpencodeClient } from "../../../lib/opencode-client";
import { runGit, runGitOrEmpty } from "../../../lib/git";
import { parsePort } from "../../../lib/validation";

const INVALID_REF_CHARS = /[\s~^:?*[\\\x00-\x1f]/;

const DIFF_FLAGS = ["--no-ext-diff", "--no-color"];

function isValidRef(ref: string): boolean {
  if (!ref || ref.length > 250) return false;
  if (ref.startsWith("-")) return false;
  if (INVALID_REF_CHARS.test(ref)) return false;
  if (ref.includes("..") || ref.includes("@{")) return false;
  if (ref.endsWith(".") || ref.endsWith("/") || ref.includes("//")) return false;
  return true;
}

export default defineHandler(async (event) => {
  const port = parsePort(event);
  const query = getQuery(event);
  const from = typeof query.from === "string" ? query.from : undefined;
  const to = typeof query.to === "string" ? query.to : undefined;
  const modeParam = typeof query.mode === "string" ? query.mode : undefined;
  const direct = modeParam === "direct";

  try {
    const client = getOpencodeClient(port);
    const project = await client.project.current();

    if (!project.data?.worktree) {
      throw new HTTPError("No project worktree found", { status: 404 });
    }

    const worktree = project.data.worktree;

    if (!from && !to) {
      const { stdout } = await runGit(worktree, [
        "diff",
        ...DIFF_FLAGS,
        "HEAD",
        "--",
      ]);
      return { diff: stdout, worktree };
    }

    if (!from || !to || !isValidRef(from) || !isValidRef(to)) {
      throw new HTTPError("Invalid ref for branch comparison", { status: 400 });
    }

    const [currentResult, fromRef, toRef] = await Promise.all([
      runGitOrEmpty(worktree, ["branch", "--show-current"]),
      runGitOrEmpty(worktree, ["rev-parse", "--verify", "--quiet", from]),
      runGitOrEmpty(worktree, ["rev-parse", "--verify", "--quiet", to]),
    ]);

    if (!fromRef.stdout.trim()) {
      throw new HTTPError(`Unknown branch or ref: ${from}`, { status: 400 });
    }
    if (!toRef.stdout.trim()) {
      throw new HTTPError(`Unknown branch or ref: ${to}`, { status: 400 });
    }

    const mergeBaseResult = await runGitOrEmpty(worktree, [
      "merge-base",
      from,
      to,
    ]);
    const mergeBase = mergeBaseResult.stdout.trim();

    if (!direct && !mergeBase) {
      throw new HTTPError(
        `No common ancestor between ${from} and ${to}. Use Full diff to compare anyway.`,
        { status: 400 },
      );
    }

    const [diffResult, countResult] = await Promise.all([
      runGit(worktree, [
        "diff",
        ...DIFF_FLAGS,
        ...(direct ? [from, to] : [`${from}...${to}`]),
        "--",
      ]),
      mergeBase
        ? runGitOrEmpty(worktree, [
            "rev-list",
            "--count",
            `${mergeBase}..${to}`,
          ])
        : Promise.resolve(null),
    ]);

    const commits = countResult
      ? Number(countResult.stdout.trim()) || 0
      : undefined;

    return {
      diff: diffResult.stdout,
      worktree,
      from,
      to,
      mode: direct ? "direct" : "merge",
      mergeBase,
      commits,
      currentBranch: currentResult.stdout.trim(),
    };
  } catch (error) {
    if (error instanceof HTTPError) throw error;
    const err = error as { stderr?: string; message?: string };
    throw new HTTPError(err.stderr || err.message || "Failed to get git diff", {
      status: 500,
    });
  }
});
