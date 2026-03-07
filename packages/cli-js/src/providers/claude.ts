/**
 * Claude provider - planning (e.g. /p)
 */

import { execSync } from "child_process";
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
    if (opts?.context?.trim()) {
      body += "\n\n---\n\nConversation context:\n" + opts.context.trim();
    }
    fullPrompt = body + "\n\n---\n\nUser goal: " + goal;
  } catch {
    let fallback = "Produce a development plan with sections: Goal, Assumptions, Relevant Codebase Areas, Proposed Changes, Step-by-Step Plan, Files Likely to Change, Risks, Validation Checklist.";
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
    if (opts?.context?.trim()) {
      body += "\n\n---\n\nConversation context:\n" + opts.context.trim();
    }
    fullPrompt = body + "\n\n---\n\nUser request: " + prompt;
  } catch {
    let fallback = DEFAULT_IMPLEMENTER_FALLBACK;
    if (opts?.context?.trim()) {
      fallback += "\n\n---\n\nConversation context:\n" + opts.context.trim();
    }
    fullPrompt = fallback + "\n\n---\n\nUser request: " + prompt;
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
    throw new Error("Claude implement failed: " + msg);
  }
}
