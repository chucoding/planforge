/**
 * Codex provider - planning (/p) and implementation (/i)
 */

import { randomBytes } from "crypto";
import { spawnSync, spawn } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { readFile } from "fs/promises";
import { resolve, dirname, join } from "path";
import { hasCommand } from "../utils/shell.js";
import { getTemplatesRoot } from "../utils/paths.js";
import type { PlanOpts, ImplementOpts } from "./registry.js";

/** npm package for global install: npm install -g @openai/codex */
export const CLIENT_NPM_PACKAGE = "@openai/codex";

export function checkCodex(): boolean {
  return hasCommand("codex");
}

function getRepoRoot(): string {
  return dirname(getTemplatesRoot());
}

/**
 * True if stdout looks like a development plan (has expected section headings).
 * Used to still save the plan when Codex exits 1 due to rollout recorder / cache errors.
 */
function looksLikePlan(stdout: string): boolean {
  const t = (stdout ?? "").trim();
  if (t.length < 200) return false;
  const hasGoal =
    t.includes("**Goal**") || t.includes("## Goal");
  const hasLaterSection =
    t.includes("**Step-by-Step Plan**") ||
    t.includes("## Step-by-Step Plan") ||
    t.includes("**Validation Checklist**") ||
    t.includes("## Validation Checklist");
  return hasGoal && hasLaterSection;
}

/**
 * Run "codex exec" with the given prompt. On Windows uses temp file + PowerShell to avoid
 * EINVAL from spawning .cmd directly (CVE-2024-27980) and to avoid shell splitting long args.
 * When allowPlanFallback is true, non-zero exit is still treated as success if stdout looks like a plan
 * (used only for runPlan; runImplement must not treat non-zero as success).
 */
function runCodexExec(fullPrompt: string, cwd: string, allowPlanFallback = false): string {
  const opts = { cwd, encoding: "utf-8" as const, maxBuffer: 1024 * 1024 };

  if (process.platform === "win32") {
    const tempPath = join(tmpdir(), "planforge-" + randomBytes(8).toString("hex") + ".txt");
    try {
      writeFileSync(tempPath, fullPrompt, "utf-8");
      const escapedPath = tempPath.replace(/'/g, "''");
      const script = `Get-Content -Raw -LiteralPath '${escapedPath}' | codex exec -`;
      const result = spawnSync("powershell", ["-NoProfile", "-Command", script], opts);
      const out = (result.stdout ?? "").trim();
      if (result.status !== 0) {
        if (allowPlanFallback && result.status === 1 && looksLikePlan(out)) {
          console.error("Warning: Codex exited with code 1 but stdout looks like a plan; saving it anyway.");
          return out;
        }
        const msg = result.stderr ?? result.stdout ?? result.error?.message ?? "Codex exited non-zero";
        throw new Error(String(msg));
      }
      return out;
    } finally {
      try {
        unlinkSync(tempPath);
      } catch {
        // ignore cleanup failure
      }
    }
  }

  const result = spawnSync("codex", ["exec", fullPrompt], { ...opts, shell: false });
  const out = (result.stdout ?? "").trim();
  if (result.status !== 0) {
    if (allowPlanFallback && result.status === 1 && looksLikePlan(out)) {
      console.error("Warning: Codex exited with code 1 but stdout looks like a plan; saving it anyway.");
      return out;
    }
    const msg = result.stderr ?? result.stdout ?? result.error?.message ?? "Codex exited non-zero";
    throw new Error(String(msg));
  }
  return out;
}

/**
 * Run "codex exec" with streaming: forward stdout/stderr to the current process so the user
 * sees logs in real time (e.g. in Cursor chat terminal). Returns collected stdout when done.
 */
function runCodexExecStreaming(fullPrompt: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const opts = { cwd };

    if (process.platform === "win32") {
      const tempPath = join(tmpdir(), "planforge-" + randomBytes(8).toString("hex") + ".txt");
      writeFileSync(tempPath, fullPrompt, "utf-8");
      const escapedPath = tempPath.replace(/'/g, "''");
      const script = `Get-Content -Raw -LiteralPath '${escapedPath}' | codex exec -`;
      const child = spawn("powershell", ["-NoProfile", "-Command", script], {
        ...opts,
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.on("close", (code) => {
        try {
          unlinkSync(tempPath);
        } catch {
          // ignore
        }
        if (code !== 0) {
          reject(new Error("Codex exited with code " + code));
          return;
        }
        resolve(Buffer.concat(chunks).toString("utf-8").trim());
      });
      child.stdout?.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
        process.stdout.write(chunk);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        process.stderr.write(chunk);
      });
      return;
    }

    const child = spawn("codex", ["exec", fullPrompt], {
      ...opts,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      process.stdout.write(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error("Codex exited with code " + code));
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf-8").trim());
    });
    child.on("error", (err) => reject(err));
  });
}

const DEFAULT_PLANNER_FALLBACK =
  "Produce a development plan with sections: Goal, Assumptions, Relevant Codebase Areas, Proposed Changes, Step-by-Step Plan, Files Likely to Change, Risks, Validation Checklist.";

/**
 * Run Codex to generate a plan. Returns plan markdown.
 */
export async function runPlan(goal: string, opts?: PlanOpts): Promise<string> {
  const cwd = opts?.cwd ?? process.cwd();
  const repoRoot = getRepoRoot();
  const defaultPromptPath = resolve(repoRoot, "packages", "core", "prompts", "planner-system.md");

  let fullPrompt: string;
  try {
    const systemPrompt = await readFile(
      opts?.systemPromptPath ?? defaultPromptPath,
      "utf-8"
    );
    let body = systemPrompt.trim();
    if (opts?.projectContext?.trim()) {
      body += `\n\n---\n\nProject context (${opts.projectContextSource ?? "AGENTS.md"}):\n${opts.projectContext.trim()}`;
    }
    if (opts?.repoContext?.trim()) {
      body += "\n\n---\n\nRepository context:\n" + opts.repoContext.trim();
    }
    if (opts?.context?.trim()) {
      body += "\n\n---\n\nConversation context:\n" + opts.context.trim();
    }
    fullPrompt = body + "\n\n---\n\nUser goal: " + goal;
  } catch {
    let fallback = DEFAULT_PLANNER_FALLBACK;
    if (opts?.projectContext?.trim()) {
      fallback += `\n\n---\n\nProject context (${opts.projectContextSource ?? "AGENTS.md"}):\n${opts.projectContext.trim()}`;
    }
    if (opts?.repoContext?.trim()) {
      fallback += "\n\n---\n\nRepository context:\n" + opts.repoContext.trim();
    }
    if (opts?.context?.trim()) {
      fallback += "\n\n---\n\nConversation context:\n" + opts.context.trim();
    }
    fullPrompt = fallback + "\n\n---\n\nUser goal: " + goal;
  }

  try {
    return runCodexExec(fullPrompt, cwd, true);
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
export async function runImplement(prompt: string, opts?: ImplementOpts): Promise<string> {
  const cwd = opts?.cwd ?? process.cwd();
  const repoRoot = getRepoRoot();
  const defaultPromptPath = resolve(repoRoot, "packages", "core", "prompts", "implementer-system.md");

  let fullPrompt: string;
  try {
    const systemPrompt = await readFile(
      opts?.systemPromptPath ?? defaultPromptPath,
      "utf-8"
    );
    let body = systemPrompt.trim();
    if (opts?.projectContext?.trim()) {
      body += `\n\n---\n\nProject context (${opts.projectContextSource ?? "AGENTS.md"}):\n${opts.projectContext.trim()}`;
    }
    if (opts?.context?.trim()) {
      body += "\n\n---\n\nConversation context:\n" + opts.context.trim();
    }
    if (opts?.planContent?.trim()) {
      body += "\n\n---\n\nCurrent plan (follow this):\n" + opts.planContent.trim();
    }
    if (opts?.filesToChange?.length) {
      body += "\n\n---\n\nFiles to focus on:\n" + opts.filesToChange.join("\n");
    }
    if (opts?.recentCommitsPerFile?.trim()) {
      body += "\n\n---\n\nRecent commit (per file):\n" + opts.recentCommitsPerFile.trim();
    }
    if (opts?.codeContext?.trim()) {
      body += "\n\n---\n\nRelevant file contents:\n" + opts.codeContext.trim();
    }
    fullPrompt = body + "\n\n---\n\nUser request: " + prompt;
  } catch {
    let fallback = DEFAULT_IMPLEMENTER_FALLBACK;
    if (opts?.projectContext?.trim()) {
      fallback += `\n\n---\n\nProject context (${opts.projectContextSource ?? "AGENTS.md"}):\n${opts.projectContext.trim()}`;
    }
    if (opts?.context?.trim()) {
      fallback += "\n\n---\n\nConversation context:\n" + opts.context.trim();
    }
    if (opts?.planContent?.trim()) {
      fallback += "\n\n---\n\nCurrent plan (follow this):\n" + opts.planContent.trim();
    }
    if (opts?.filesToChange?.length) {
      fallback += "\n\n---\n\nFiles to focus on:\n" + opts.filesToChange.join("\n");
    }
    if (opts?.recentCommitsPerFile?.trim()) {
      fallback += "\n\n---\n\nRecent commit (per file):\n" + opts.recentCommitsPerFile.trim();
    }
    if (opts?.codeContext?.trim()) {
      fallback += "\n\n---\n\nRelevant file contents:\n" + opts.codeContext.trim();
    }
    fullPrompt = fallback + "\n\n---\n\nUser request: " + prompt;
  }

  try {
    return await runCodexExecStreaming(fullPrompt, cwd);
  } catch (err) {
    const msg = (err as { stdout?: string; stderr?: string; message?: string }).stdout
      ?? (err as { stderr?: string }).stderr
      ?? (err as Error).message;
    throw new Error("Codex implement failed: " + msg);
  }
}
