/**
 * Codex provider - planning (/p) and implementation (/i)
 */

import { randomBytes } from "crypto";
import { spawnSync, spawn } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { readFile } from "fs/promises";
import { resolve, join } from "path";
import { hasCommand, resolveCommandPathWithNpmFallback } from "../utils/shell.js";
import { getPromptsDir } from "../utils/paths.js";
import { loadPrompt } from "../utils/prompt.js";
import type { PlanOpts, ImplementOpts } from "./registry.js";

/** npm package for global install: npm install -g @openai/codex */
export const CLIENT_NPM_PACKAGE = "@openai/codex";

/**
 * Resolve full path to codex executable. Tries PATH first, then common install
 * locations so it works in sandboxed environments (e.g. Cursor agent) where PATH may be restricted.
 */
function resolveCodexExe(): string | null {
  return resolveCommandPathWithNpmFallback("codex");
}

export function checkCodex(): boolean {
  return hasCommand("codex") || resolveCodexExe() !== null;
}

/**
 * Try to list available Codex models via CLI. Returns null if CLI has no free list command or it fails.
 * Used by doctor ai to show model choices; falls back to planforge.json when null.
 */
export async function listModelsCodex(): Promise<string[] | null> {
  if (resolveCodexExe() === null) return null;
  return null;
}

export interface CompleteOneTurnOpts {
  cwd?: string;
  model?: string;
}

interface StreamExecOpts {
  writeStdout?: boolean;
  onChunk?: (chunk: string) => void;
  timeoutMs?: number;
}

const CODEX_ONE_TURN_TIMEOUT_MS = 300_000;

/**
 * Single-turn completion for doctor ai workflow tests. Sends systemPrompt + userMessage and returns response text.
 */
export async function completeOneTurn(
  systemPrompt: string,
  userMessage: string,
  opts?: CompleteOneTurnOpts
): Promise<string> {
  const cwd = opts?.cwd ?? process.cwd();
  const fullPrompt = systemPrompt.trim() + "\n\n---\n\nUser: " + userMessage.trim();
  return runCodexExec(fullPrompt, cwd, false);
}

export async function streamOneTurn(
  systemPrompt: string,
  userMessage: string,
  onChunk: (chunk: string) => void,
  opts?: CompleteOneTurnOpts
): Promise<string> {
  const cwd = opts?.cwd ?? process.cwd();
  const fullPrompt = systemPrompt.trim() + "\n\n---\n\nUser: " + userMessage.trim();
  try {
    return await runCodexExecStreaming(fullPrompt, cwd, false, {
      writeStdout: false,
      onChunk,
      timeoutMs: CODEX_ONE_TURN_TIMEOUT_MS,
    });
  } catch (err) {
    const msg = (err as { stdout?: string; stderr?: string; message?: string }).stdout
      ?? (err as { stderr?: string }).stderr
      ?? (err as Error).message;
    throw new Error("Codex streamOneTurn failed: " + msg);
  }
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
const CODEX_NOT_FOUND_MSG =
  "codex not found in PATH or common locations. Install: npm install -g @openai/codex";

function runCodexExec(fullPrompt: string, cwd: string, allowPlanFallback = false): string {
  const exe = resolveCodexExe();
  if (!exe) throw new Error(CODEX_NOT_FOUND_MSG);

  const opts = { cwd, encoding: "utf-8" as const, maxBuffer: 1024 * 1024 };

  if (process.platform === "win32") {
    const tempPath = join(tmpdir(), "planforge-" + randomBytes(8).toString("hex") + ".txt");
    try {
      writeFileSync(tempPath, fullPrompt, "utf-8");
      const escapedPath = tempPath.replace(/'/g, "''");
      const escapedExe = exe.replace(/'/g, "''");
      const script = `Get-Content -Raw -LiteralPath '${escapedPath}' -Encoding UTF8 | & '${escapedExe}' exec -`;
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

  const result = spawnSync(exe, ["exec", fullPrompt], { ...opts, shell: false });
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
 * When allowPlanFallback is true (plan only), exit code 1 may still resolve with collected
 * stdout if it looks like a plan (e.g. Codex 1 due to rollout/cache).
 */
function runCodexExecStreaming(
  fullPrompt: string,
  cwd: string,
  allowPlanFallback = false,
  streamOpts?: StreamExecOpts
): Promise<string> {
  const exe = resolveCodexExe();
  if (!exe) return Promise.reject(new Error(CODEX_NOT_FOUND_MSG));

  const timeoutMs = streamOpts?.timeoutMs;
  const useTimeout = timeoutMs === undefined ? true : timeoutMs !== 0;
  const effectiveMs = timeoutMs === undefined ? CODEX_ONE_TURN_TIMEOUT_MS : timeoutMs === 0 ? 0 : timeoutMs;

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const opts = { cwd };
    const writeStdout = streamOpts?.writeStdout ?? true;
    let settled = false;

    const scheduleTimeout = (child: ReturnType<typeof spawn>) => {
      if (!useTimeout || effectiveMs === 0) return () => {};
      const t = setTimeout(() => {
        child.kill();
        if (!settled) {
          settled = true;
          reject(new Error(`Codex streaming timed out after ${Math.floor(effectiveMs / 1000)}s`));
        }
      }, effectiveMs);
      return () => clearTimeout(t);
    };

    const finish = (code: number | null) => {
      if (settled) return;
      const out = Buffer.concat(chunks).toString("utf-8").trim();
      if (code === 0) {
        settled = true;
        resolve(out);
        return;
      }
      if (allowPlanFallback && code === 1 && looksLikePlan(out)) {
        console.error("Warning: Codex exited with code 1 but stdout looks like a plan; saving it anyway.");
        settled = true;
        resolve(out);
        return;
      }
      const stderr = Buffer.concat(stderrChunks).toString("utf-8").trim();
      settled = true;
      reject(new Error(stderr || "Codex exited with code " + code));
    };

    const handleStdout = (chunk: Buffer) => {
      chunks.push(chunk);
      const text = chunk.toString("utf-8");
      streamOpts?.onChunk?.(text);
      if (writeStdout) {
        process.stdout.write(chunk);
      }
    };

    const handleStderr = (chunk: Buffer) => {
      stderrChunks.push(chunk);
      process.stderr.write(chunk);
    };

    if (process.platform === "win32") {
      const tempPath = join(tmpdir(), "planforge-" + randomBytes(8).toString("hex") + ".txt");
      writeFileSync(tempPath, fullPrompt, "utf-8");
      const escapedPath = tempPath.replace(/'/g, "''");
      const escapedExe = exe.replace(/'/g, "''");
      const script = `Get-Content -Raw -LiteralPath '${escapedPath}' -Encoding UTF8 | & '${escapedExe}' exec -`;
      const child = spawn("powershell", ["-NoProfile", "-Command", script], {
        ...opts,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const clearTimeoutRef = scheduleTimeout(child);
      child.on("close", (code) => {
        clearTimeoutRef();
        try {
          unlinkSync(tempPath);
        } catch {
          // ignore
        }
        finish(code);
      });
      child.stdout?.on("data", handleStdout);
      child.stderr?.on("data", handleStderr);
      child.on("error", (err) => {
        clearTimeoutRef();
        if (!settled) {
          settled = true;
          reject(err);
        }
      });
      return;
    }

    const child = spawn(exe, ["exec", fullPrompt], {
      ...opts,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const clearTimeoutRef = scheduleTimeout(child);
    child.stdout?.on("data", handleStdout);
    child.stderr?.on("data", handleStderr);
    child.on("close", (code) => {
      clearTimeoutRef();
      finish(code);
    });
    child.on("error", (err) => {
      clearTimeoutRef();
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
  });
}

/**
 * Run Codex to generate a plan. Returns plan markdown.
 */
export async function runPlan(goal: string, opts?: PlanOpts): Promise<string> {
  const cwd = opts?.cwd ?? process.cwd();
  const promptsDir = getPromptsDir();
  const defaultPromptPath = resolve(promptsDir, "planner-system.md");
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
  const appendI18n = await loadPrompt(resolve(promptsDir, "append-i18n.md"));
  const appendSlug = await loadPrompt(resolve(promptsDir, "append-slug.md"));
  body += "\n\n---\n\n" + appendI18n + "\n\n" + appendSlug;
  const fullPrompt = body + "\n\n---\n\nUser goal: " + goal;

  try {
    let onFirstChunkFired = false;
    const streamOpts: { timeoutMs?: number; onChunk?: (chunk: string) => void } = {
      timeoutMs: opts?.streamTimeoutMs,
    };
    if (opts?.onFirstChunk) {
      streamOpts.onChunk = (chunk: string) => {
        if (!onFirstChunkFired && chunk.length > 0) {
          onFirstChunkFired = true;
          opts.onFirstChunk!();
        }
      };
    }
    return await runCodexExecStreaming(fullPrompt, cwd, true, streamOpts);
  } catch (err) {
    const msg = (err as { stdout?: string; stderr?: string; message?: string }).stdout
      ?? (err as { stderr?: string }).stderr
      ?? (err as Error).message;
    throw new Error("Codex plan failed: " + msg);
  }
}

/**
 * Run Codex to perform implementation. Returns implementation output.
 */
export async function runImplement(prompt: string, opts?: ImplementOpts): Promise<string> {
  const cwd = opts?.cwd ?? process.cwd();
  const promptsDir = getPromptsDir();
  const defaultPromptPath = resolve(promptsDir, "implementer-system.md");
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
  const fullPrompt = body + "\n\n---\n\nUser request: " + prompt;

  try {
    return await runCodexExecStreaming(fullPrompt, cwd, false, {
      timeoutMs: opts?.streamTimeoutMs,
    });
  } catch (err) {
    const msg = (err as { stdout?: string; stderr?: string; message?: string }).stdout
      ?? (err as { stderr?: string }).stderr
      ?? (err as Error).message;
    throw new Error("Codex implement failed: " + msg);
  }
}
