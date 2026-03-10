/**
 * Claude provider - planning (e.g. /p)
 */

import { execSync, spawn } from "child_process";
import { readFile } from "fs/promises";
import { resolve, dirname } from "path";
import { hasCommand } from "../utils/shell.js";
import { getTemplatesRoot } from "../utils/paths.js";
import type { PlanOpts, ImplementOpts } from "./registry.js";

/** npm package for global install: npm install -g @anthropic-ai/claude-code */
export const CLIENT_NPM_PACKAGE = "@anthropic-ai/claude-code";

export function checkClaude(): boolean {
  return hasCommand("claude");
}

/**
 * Run Claude to generate a plan. Returns plan markdown.
 */
export async function runPlan(goal: string, opts?: PlanOpts): Promise<string> {
  const cwd = opts?.cwd ?? process.cwd();
  const templatesRoot = getTemplatesRoot();
  const repoRoot = dirname(templatesRoot);
  const defaultPromptPath = resolve(repoRoot, "packages", "core", "prompts", "planner-system.md");

  let fullPrompt: string;
  try {
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
    fullPrompt = body + "\n\n---\n\nUser goal: " + goal;
  } catch {
    let fallback = "Produce a development plan with sections: Goal, Assumptions, Relevant Codebase Areas, Proposed Changes, Step-by-Step Plan, Files Likely to Change, Risks, Validation Checklist.";
    if (opts?.projectContext?.trim()) {
      fallback += `\n\n---\n\nProject context (${opts.projectContextSource ?? "CLAUDE.md"}):\n${opts.projectContext.trim()}`;
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
    const out = execSync("claude", {
      encoding: "utf-8",
      input: fullPrompt,
      cwd,
      maxBuffer: 1024 * 1024,
    });
    return typeof out === "string" ? out.trim() : String(out).trim();
  } catch (err) {
    const msg = (err as { stdout?: string; stderr?: string; message?: string }).stdout
      ?? (err as { stderr?: string }).stderr
      ?? (err as Error).message;
    throw new Error("Claude plan failed: " + msg);
  }
}

const DEFAULT_IMPLEMENTER_FALLBACK =
  "Implement the user request. Produce code or concrete changes as requested.";

/**
 * Run Claude to perform implementation. Returns implementation output (e.g. code or instructions).
 */
export async function runImplement(prompt: string, opts?: ImplementOpts): Promise<string> {
  const cwd = opts?.cwd ?? process.cwd();
  const templatesRoot = getTemplatesRoot();
  const repoRoot = dirname(templatesRoot);
  const defaultPromptPath = resolve(repoRoot, "packages", "core", "prompts", "implementer-system.md");

  let fullPrompt: string;
  try {
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
    fullPrompt = body + "\n\n---\n\nUser request: " + prompt;
  } catch {
    let fallback = DEFAULT_IMPLEMENTER_FALLBACK;
    if (opts?.projectContext?.trim()) {
      fallback += `\n\n---\n\nProject context (${opts.projectContextSource ?? "CLAUDE.md"}):\n${opts.projectContext.trim()}`;
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
    return await runClaudeStreaming(fullPrompt, cwd);
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
 */
function runClaudeStreaming(fullPrompt: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const child = spawn("claude", [], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin?.write(fullPrompt, "utf-8", (err) => {
      if (err) reject(err);
      else child.stdin?.end();
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
        reject(new Error("Claude exited with code " + code));
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf-8").trim());
    });
    child.on("error", (err) => reject(err));
  });
}
