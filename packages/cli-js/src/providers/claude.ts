/**
 * Claude provider - planning (e.g. /p)
 */

import { randomBytes } from "crypto";
import { spawn, spawnSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { readFile } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { hasCommand, resolveCommandPathWithNpmFallback } from "../utils/shell.js";
import { getPromptsDir } from "../utils/paths.js";
import { loadPrompt } from "../utils/prompt.js";
import type { PlanOpts, ImplementOpts } from "./registry.js";

/** npm package for global install: npm install -g @anthropic-ai/claude-code */
export const CLIENT_NPM_PACKAGE = "@anthropic-ai/claude-code";

/**
 * Resolve full path to claude executable. Tries PATH first, then common install
 * locations (e.g. npm global bin) so it works in sandboxed environments (e.g. Cursor agent)
 * where PATH may be restricted.
 */
function resolveClaudeExe(): string | null {
  return resolveCommandPathWithNpmFallback("claude");
}

export function checkClaude(): boolean {
  return hasCommand("claude") || resolveClaudeExe() !== null;
}

/**
 * Try to list available Claude models via CLI. Returns null if CLI has no free list command or it fails.
 * Used by doctor ai to show model choices; falls back to planforge.json when null.
 */
export async function listModelsClaude(): Promise<string[] | null> {
  if (resolveClaudeExe() === null) return null;
  return null;
}

export interface CompleteOneTurnOpts {
  cwd?: string;
  model?: string;
}

interface StreamOpts extends CompleteOneTurnOpts {
  writeStdout?: boolean;
  /** Stream timeout in ms. 0 or undefined = no timeout. */
  streamTimeoutMs?: number;
}

const CLAUDE_ONE_TURN_TIMEOUT_MS = 120_000;

/**
 * Single-turn completion for doctor ai workflow tests. Sends systemPrompt + userMessage and returns response text.
 * On Windows uses temp file + PowerShell to avoid EINVAL from spawning .cmd directly (CVE-2024-27980).
 */
export async function completeOneTurn(
  systemPrompt: string,
  userMessage: string,
  opts?: CompleteOneTurnOpts
): Promise<string> {
  const cwd = opts?.cwd ?? process.cwd();
  const exe = resolveClaudeExe();
  if (!exe) {
    throw new Error(
      "claude not found in PATH or common locations (e.g. npm global bin). Install: npm install -g @anthropic-ai/claude-code"
    );
  }
  const fullPrompt = systemPrompt.trim() + "\n\n---\n\nUser: " + userMessage.trim();

  try {
    if (process.platform === "win32") {
      const tempPath = join(tmpdir(), "planforge-claude-" + randomBytes(8).toString("hex") + ".txt");
      try {
        writeFileSync(tempPath, fullPrompt, "utf-8");
        const escapedPath = tempPath.replace(/'/g, "''");
        const escapedExe = exe.replace(/'/g, "''");
        const modelArg = opts?.model ? ` --model '${opts.model.replace(/'/g, "''")}'` : "";
        const script = `Get-Content -Raw -LiteralPath '${escapedPath}' -Encoding UTF8 | & '${escapedExe}'${modelArg}`;
        const result = spawnSync("powershell", ["-NoProfile", "-Command", script], {
          encoding: "utf-8",
          cwd,
          maxBuffer: 512 * 1024,
        });
        if (result.status !== 0) {
          const msg = result.stderr ?? result.stdout ?? result.error?.message ?? "Claude exited non-zero";
          throw new Error(String(msg));
        }
        const out = (result.stdout ?? "").trim();
        return typeof out === "string" ? out : String(out);
      } finally {
        try {
          unlinkSync(tempPath);
        } catch {
          // ignore cleanup failure
        }
      }
    }

    const args: string[] = ["--system-prompt", systemPrompt.trim(), "-p", userMessage.trim()];
    if (opts?.model) {
      args.unshift("--model", opts.model);
    }
    const result = spawnSync(exe, args, {
      encoding: "utf-8",
      cwd,
      maxBuffer: 512 * 1024,
    });
    if (result.status !== 0) {
      const msg = result.stderr ?? result.stdout ?? result.error?.message ?? "Claude exited non-zero";
      throw new Error(String(msg));
    }
    const out = (result.stdout ?? "").trim();
    return typeof out === "string" ? out : String(out);
  } catch (err) {
    const msg = (err as { stdout?: string; stderr?: string; message?: string }).stdout
      ?? (err as { stderr?: string }).stderr
      ?? (err as Error).message;
    throw new Error("Claude completeOneTurn failed: " + msg);
  }
}

export async function streamOneTurn(
  systemPrompt: string,
  userMessage: string,
  onChunk: (chunk: string) => void,
  opts?: CompleteOneTurnOpts
): Promise<string> {
  try {
    return await runClaudeOneTurnStreaming(systemPrompt, userMessage, opts, onChunk);
  } catch (err) {
    const msg = (err as { stdout?: string; stderr?: string; message?: string }).stdout
      ?? (err as { stderr?: string }).stderr
      ?? (err as Error).message;
    throw new Error("Claude streamOneTurn failed: " + msg);
  }
}

/**
 * Run Claude to generate a plan. Returns plan markdown.
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
    body += `\n\n---\n\nProject context (${opts.projectContextSource ?? "CLAUDE.md"}):\n${opts.projectContext.trim()}`;
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
    const onChunk = opts?.onFirstChunk
      ? (chunk: string) => {
          if (!onFirstChunkFired && chunk.length > 0) {
            onFirstChunkFired = true;
            opts!.onFirstChunk!();
          }
        }
      : undefined;
    return await runClaudeStreaming(fullPrompt, cwd, { streamTimeoutMs: opts?.streamTimeoutMs }, onChunk);
  } catch (err) {
    const msg = (err as { stdout?: string; stderr?: string; message?: string }).stdout
      ?? (err as { stderr?: string }).stderr
      ?? (err as Error).message;
    throw new Error("Claude plan failed: " + msg);
  }
}

/**
 * Run Claude to perform implementation. Returns implementation output (e.g. code or instructions).
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
    body += `\n\n---\n\nProject context (${opts.projectContextSource ?? "CLAUDE.md"}):\n${opts.projectContext.trim()}`;
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
    return await runClaudeStreaming(fullPrompt, cwd, { streamTimeoutMs: opts?.streamTimeoutMs });
  } catch (err) {
    const msg = (err as { stdout?: string; stderr?: string; message?: string }).stdout
      ?? (err as { stderr?: string }).stderr
      ?? (err as Error).message;
    throw new Error("Claude implement failed: " + msg);
  }
}

/**
 * Run Claude with streaming: forward stdout/stderr to the current process so the user
 * sees logs in real time (e.g. in Cursor chat terminal). Returns collected stdout when done.
 * On Windows uses temp file + PowerShell to avoid EINVAL from spawning .cmd directly (CVE-2024-27980).
 */
function runClaudeStreaming(
  fullPrompt: string,
  cwd: string,
  opts?: Pick<StreamOpts, "writeStdout" | "streamTimeoutMs">,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const exe = resolveClaudeExe();
  if (!exe) {
    return Promise.reject(
      new Error(
        "claude not found in PATH or common locations (e.g. npm global bin). Install: npm install -g @anthropic-ai/claude-code"
      )
    );
  }
  const timeoutMs = opts?.streamTimeoutMs;
  const useTimeout = timeoutMs !== undefined && timeoutMs !== 0;
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const writeStdout = opts?.writeStdout ?? true;
    let settled = false;

    const finishReject = (message: string) => {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    };

    const finishResolve = () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString("utf-8").trim());
    };

    const handleStdout = (chunk: Buffer) => {
      chunks.push(chunk);
      const text = chunk.toString("utf-8");
      onChunk?.(text);
      if (writeStdout) {
        process.stdout.write(chunk);
      }
    };

    const handleStderr = (chunk: Buffer) => {
      stderrChunks.push(chunk);
      process.stderr.write(chunk);
    };

    const scheduleTimeout = (child: ReturnType<typeof spawn>) => {
      if (!useTimeout) return () => {};
      const t = setTimeout(() => {
        child.kill();
        finishReject(`Claude streaming timed out after ${Math.floor(timeoutMs! / 1000)}s`);
      }, timeoutMs!);
      return () => clearTimeout(t);
    };

    if (process.platform === "win32") {
      const tempPath = join(tmpdir(), "planforge-claude-" + randomBytes(8).toString("hex") + ".txt");
      writeFileSync(tempPath, fullPrompt, "utf-8");
      const escapedPath = tempPath.replace(/'/g, "''");
      const escapedExe = exe.replace(/'/g, "''");
      const script = `Get-Content -Raw -LiteralPath '${escapedPath}' -Encoding UTF8 | & '${escapedExe}'`;
      const child = spawn("powershell", ["-NoProfile", "-Command", script], {
        cwd,
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
        if (settled) return;
        if (code !== 0) {
          const stderr = Buffer.concat(stderrChunks).toString("utf-8").trim();
          finishReject(stderr || "Claude exited with code " + code);
          return;
        }
        finishResolve();
      });
      child.stdout?.on("data", handleStdout);
      child.stderr?.on("data", handleStderr);
      child.on("error", (err) => {
        clearTimeoutRef();
        finishReject(err.message);
      });
      return;
    }

    const child = spawn(exe, [], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin?.write(fullPrompt, "utf-8", (err) => {
      if (err) {
        finishReject(err.message);
        return;
      }
      child.stdin?.end();
    });
    const clearTimeoutRef = scheduleTimeout(child);
    child.stdout?.on("data", handleStdout);
    child.stderr?.on("data", handleStderr);
    child.on("close", (code) => {
      clearTimeoutRef();
      if (settled) return;
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString("utf-8").trim();
        finishReject(stderr || "Claude exited with code " + code);
        return;
      }
      finishResolve();
    });
    child.on("error", (err) => {
      clearTimeoutRef();
      finishReject(err.message);
    });
  });
}

function runClaudeOneTurnStreaming(
  systemPrompt: string,
  userMessage: string,
  opts?: CompleteOneTurnOpts,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const cwd = opts?.cwd ?? process.cwd();
  const exe = resolveClaudeExe();
  if (!exe) {
    return Promise.reject(
      new Error(
        "claude not found in PATH or common locations (e.g. npm global bin). Install: npm install -g @anthropic-ai/claude-code"
      )
    );
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    const finishReject = (message: string) => {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    };

    const finishResolve = () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString("utf-8").trim());
    };

    const handleStdout = (chunk: Buffer) => {
      chunks.push(chunk);
      onChunk?.(chunk.toString("utf-8"));
    };

    const handleStderr = (chunk: Buffer) => {
      stderrChunks.push(chunk);
      process.stderr.write(chunk);
    };

    if (process.platform === "win32") {
      const fullPrompt = systemPrompt.trim() + "\n\n---\n\nUser: " + userMessage.trim();
      const tempPath = join(tmpdir(), "planforge-claude-" + randomBytes(8).toString("hex") + ".txt");
      writeFileSync(tempPath, fullPrompt, "utf-8");
      const escapedPath = tempPath.replace(/'/g, "''");
      const escapedExe = exe.replace(/'/g, "''");
      const modelArg = opts?.model ? ` --model '${opts.model.replace(/'/g, "''")}'` : "";
      const script = `Get-Content -Raw -LiteralPath '${escapedPath}' -Encoding UTF8 | & '${escapedExe}'${modelArg}`;
      const child = spawn("powershell", ["-NoProfile", "-Command", script], {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const timeout = setTimeout(() => {
        child.kill();
        finishReject("Claude streaming timed out after 120s");
      }, CLAUDE_ONE_TURN_TIMEOUT_MS);
      child.on("close", (code) => {
        clearTimeout(timeout);
        try {
          unlinkSync(tempPath);
        } catch {
          // ignore
        }
        if (settled) return;
        if (code !== 0) {
          const stderr = Buffer.concat(stderrChunks).toString("utf-8").trim();
          finishReject(stderr || "Claude exited with code " + code);
          return;
        }
        finishResolve();
      });
      child.stdout?.on("data", handleStdout);
      child.stderr?.on("data", handleStderr);
      child.on("error", (err) => {
        clearTimeout(timeout);
        finishReject(err.message);
      });
      return;
    }

    const args: string[] = ["--system-prompt", systemPrompt.trim(), "-p", userMessage.trim()];
    if (opts?.model) {
      args.unshift("--model", opts.model);
    }
    const child = spawn(exe, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timeout = setTimeout(() => {
      child.kill();
      finishReject("Claude streaming timed out after 120s");
    }, CLAUDE_ONE_TURN_TIMEOUT_MS);
    child.stdout?.on("data", handleStdout);
    child.stderr?.on("data", handleStderr);
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (settled) return;
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString("utf-8").trim();
        finishReject(stderr || "Claude exited with code " + code);
        return;
      }
      finishResolve();
    });
    child.on("error", (err) => {
      clearTimeout(timeout);
      finishReject(err.message);
    });
  });
}
