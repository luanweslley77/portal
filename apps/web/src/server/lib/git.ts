import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MAX_BUFFER = 10 * 1024 * 1024;

export function runGit(worktree: string, args: string[]) {
  return execFileAsync("git", args, {
    cwd: worktree,
    maxBuffer: MAX_BUFFER,
    encoding: "utf-8",
  });
}

export function runGitOrEmpty(worktree: string, args: string[]) {
  return runGit(worktree, args).catch(() => ({ stdout: "", stderr: "" }));
}
