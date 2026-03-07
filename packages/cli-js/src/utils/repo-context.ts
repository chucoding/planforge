/**
 * Collect repository context (git status, diff stat, directory structure) for plan prompts.
 * Optionally appends goal-based ripgrep results when goal is provided. Capped to avoid token overflow.
 */

import { spawnSync } from "child_process";
import { readdirSync } from "fs";

const MAX_REPO_CONTEXT_CHARS = 3500;
const MAX_RIPGREP_CONTEXT_CHARS = 2000;
const MAX_REPO_CONTEXT_WITH_RG_CHARS = 5000;
const MAX_RIPGREP_FILES = 15;
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
 * Run ripgrep and return matching file paths (one per line), capped in count and length.
 * Returns undefined if rg is not available or fails. Uses fixed-string search (-F) for safety.
 */
function getRipgrepContext(projectRoot: string, goal: string): string | undefined {
  const pattern = goal.trim().slice(0, 100);
  if (!pattern) return undefined;

  const globExcludes = [
    "!.git/**",
    "!node_modules/**",
    "!.cursor/**",
    "!dist/**",
    "!build/**",
    "!__pycache__/**",
    "!.venv/**",
    "!venv/**",
  ];
  const args = [
    "-F",
    "-l",
    "--max-count",
    "1",
    "-g",
    ...globExcludes,
    "--max-filesize",
    "100k",
    "--",
    pattern,
  ];

  try {
    const result = spawnSync("rg", args, {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 10000,
    });
    if (result.status !== 0 && result.status !== null) return undefined;
    const lines = (result.stdout ?? "")
      .trim()
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .slice(0, MAX_RIPGREP_FILES);
    if (lines.length === 0) return undefined;
    let out = "## ripgrep (goal-related)\n" + lines.join("\n");
    if (out.length > MAX_RIPGREP_CONTEXT_CHARS) {
      out = out.slice(0, MAX_RIPGREP_CONTEXT_CHARS) + "\n...(truncated)";
    }
    return out;
  } catch {
    return undefined;
  }
}

/**
 * Build a short repository context string for the planner.
 * If goal is provided and ripgrep is available, appends goal-related file list.
 * Returns undefined if not a git repo (or on error); otherwise git status, diff --stat, top-level dirs, and optionally ripgrep results.
 */
export function getRepoContext(projectRoot: string, goal?: string): string | undefined {
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

  if (parts.length === 0 && !goal?.trim()) return undefined;

  let out = parts.length > 0 ? parts.join("\n\n") : "";
  const maxBase = goal?.trim() ? MAX_REPO_CONTEXT_WITH_RG_CHARS - MAX_RIPGREP_CONTEXT_CHARS - 50 : MAX_REPO_CONTEXT_CHARS;
  if (out.length > maxBase) {
    out = out.slice(0, maxBase) + "\n...(truncated)";
  }

  if (goal?.trim()) {
    const rgBlock = getRipgrepContext(projectRoot, goal);
    if (rgBlock) {
      out = out ? out + "\n\n" + rgBlock : rgBlock;
    }
    if (out.length > MAX_REPO_CONTEXT_WITH_RG_CHARS) {
      out = out.slice(0, MAX_REPO_CONTEXT_WITH_RG_CHARS) + "\n...(truncated)";
    }
  } else if (out.length > MAX_REPO_CONTEXT_CHARS) {
    out = out.slice(0, MAX_REPO_CONTEXT_CHARS) + "\n...(truncated)";
  }

  return out || undefined;
}
