/**
 * Collect repository context (git status, diff stat, directory structure) for plan prompts.
 * Capped to avoid token overflow (~2–4K chars).
 */

import { execSync, spawnSync } from "child_process";
import { readdirSync } from "fs";
import { resolve } from "path";

const MAX_REPO_CONTEXT_CHARS = 3500;
const SKIP_DIRS = new Set([".git", "node_modules", ".cursor", "dist", "build", "__pycache__", ".venv", "venv"]);

function runGit(cwd: string, args: string[]): string | null {
  try {
    const result = spawnSync("git", args, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    if (result.status !== 0) return null;
    return (result.stdout ?? "").trim();
  } catch {
    return null;
  }
}

function isGitRepo(cwd: string): boolean {
  const out = runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
  return out === "true";
}

function getTopLevelDirs(cwd: string): string[] {
  try {
    const names = readdirSync(cwd, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !SKIP_DIRS.has(d.name))
      .map((d) => d.name)
      .sort();
    return names;
  } catch {
    return [];
  }
}

/**
 * Build a short repository context string for the planner.
 * Returns undefined if not a git repo (or on error); otherwise git status, diff --stat, and top-level dirs.
 */
export function getRepoContext(projectRoot: string): string | undefined {
  if (!isGitRepo(projectRoot)) return undefined;

  const parts: string[] = [];

  const status = runGit(projectRoot, ["status", "--short"]);
  if (status) {
    parts.push("## git status --short\n" + status);
  }

  const diffStat = runGit(projectRoot, ["diff", "--stat"]);
  if (diffStat) {
    parts.push("## git diff --stat\n" + diffStat);
  }

  const cachedStat = runGit(projectRoot, ["diff", "--cached", "--stat"]);
  if (cachedStat) {
    parts.push("## git diff --cached --stat\n" + cachedStat);
  }

  const dirs = getTopLevelDirs(projectRoot);
  if (dirs.length > 0) {
    parts.push("## top-level directories\n" + dirs.join(", "));
  }

  if (parts.length === 0) return undefined;

  let out = parts.join("\n\n");
  if (out.length > MAX_REPO_CONTEXT_CHARS) {
    out = out.slice(0, MAX_REPO_CONTEXT_CHARS) + "\n...(truncated)";
  }
  return out;
}
