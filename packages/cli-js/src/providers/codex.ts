/**
 * Codex provider - planning (/p) and implementation (/i)
 */

import { randomBytes } from "crypto";
import { spawnSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { readFile } from "fs/promises";
import { resolve, dirname, join } from "path";
import { hasCommand } from "../utils/shell.js";
import { getTemplatesRoot } from "../utils/paths.js";

/** npm package for global install: npm install -g @openai/codex */
export const CLIENT_NPM_PACKAGE = "@openai/codex";

export function checkCodex(): boolean {
  return hasCommand("codex");
}

function getRepoRoot(): string {
  return dirname(getTemplatesRoot());
}

/**
 * Run "codex exec" with the given prompt. On Windows uses temp file + PowerShell to avoid
 * EINVAL from spawning .cmd directly (CVE-2024-27980) and to avoid shell splitting long args.
 */
function runCodexExec(fullPrompt: string, cwd: string): string {
  const opts = { cwd, encoding: "utf-8" as const, maxBuffer: 1024 * 1024 };

  if (process.platform === "win32") {
    const tempPath = join(tmpdir(), "planforge-" + randomBytes(8).toString("hex") + ".txt");
    try {
      writeFileSync(tempPath, fullPrompt, "utf-8");
      const escapedPath = tempPath.replace(/'/g, "''");
      const script = `codex exec (Get-Content -Raw -LiteralPath '${escapedPath}')`;
      const result = spawnSync("powershell", ["-NoProfile", "-Command", script], opts);
      if (result.status !== 0) {
        const msg = result.stderr ?? result.stdout ?? result.error?.message ?? "Codex exited non-zero";
        throw new Error(String(msg));
      }
      return (result.stdout ?? "").trim();
    } finally {
      try {
        unlinkSync(tempPath);
      } catch {
        // ignore cleanup failure
      }
    }
  }

  const result = spawnSync("codex", ["exec", fullPrompt], { ...opts, shell: false });
  if (result.status !== 0) {
    const msg = result.stderr ?? result.stdout ?? result.error?.message ?? "Codex exited non-zero";
    throw new Error(String(msg));
  }
  return (result.stdout ?? "").trim();
}

const DEFAULT_PLANNER_FALLBACK =
  "Produce a development plan with sections: Goal, Assumptions, Relevant Codebase Areas, Proposed Changes, Step-by-Step Plan, Files Likely to Change, Risks, Validation Checklist.";

/**
 * Run Codex to generate a plan. Returns plan markdown.
 */
export async function runPlan(
  goal: string,
  opts?: { cwd?: string; systemPromptPath?: string }
): Promise<string> {
  const cwd = opts?.cwd ?? process.cwd();
  const repoRoot = getRepoRoot();
  const defaultPromptPath = resolve(repoRoot, "packages", "core", "prompts", "planner-system.md");

  let fullPrompt: string;
  try {
    const systemPrompt = await readFile(
      opts?.systemPromptPath ?? defaultPromptPath,
      "utf-8"
    );
    fullPrompt = systemPrompt.trim() + "\n\n---\n\nUser goal: " + goal;
  } catch {
    fullPrompt = DEFAULT_PLANNER_FALLBACK + "\n\nUser goal: " + goal;
  }

  try {
    return runCodexExec(fullPrompt, cwd);
  } catch (err) {
    const msg = (err as { stdout?: string; stderr?: string; message?: string }).stdout
      ?? (err as { stderr?: string }).stderr
      ?? (err as Error).message;
    throw new Error("Codex plan failed: " + msg);
  }
}

const DEFAULT_IMPLEMENTER_FALLBACK =
  "Implement the user request. Produce code or concrete changes as requested.";

/**
 * Run Codex to perform implementation. Returns implementation output.
 */
export async function runImplement(
  prompt: string,
  opts?: { cwd?: string; planPath?: string; systemPromptPath?: string }
): Promise<string> {
  const cwd = opts?.cwd ?? process.cwd();
  const repoRoot = getRepoRoot();
  const defaultPromptPath = resolve(repoRoot, "packages", "core", "prompts", "implementer-system.md");

  let fullPrompt: string;
  try {
    const systemPrompt = await readFile(
      opts?.systemPromptPath ?? defaultPromptPath,
      "utf-8"
    );
    fullPrompt = systemPrompt.trim() + "\n\n---\n\nUser request: " + prompt;
  } catch {
    fullPrompt = DEFAULT_IMPLEMENTER_FALLBACK + "\n\nUser request: " + prompt;
  }

  try {
    return runCodexExec(fullPrompt, cwd);
  } catch (err) {
    const msg = (err as { stdout?: string; stderr?: string; message?: string }).stdout
      ?? (err as { stderr?: string }).stderr
      ?? (err as Error).message;
    throw new Error("Codex implement failed: " + msg);
  }
}
