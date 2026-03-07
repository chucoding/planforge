/**
 * Codex provider - planning (/p) and implementation (/i)
 */

import { execSync } from "child_process";
import { readFile } from "fs/promises";
import { resolve, dirname } from "path";
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
    const out = execSync("codex", {
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
    const out = execSync("codex", {
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
    throw new Error("Codex implement failed: " + msg);
  }
}
