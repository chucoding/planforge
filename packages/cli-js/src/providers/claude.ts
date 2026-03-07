/**
 * Claude provider - planning (e.g. /p)
 */

import { execSync } from "child_process";
import { readFile } from "fs/promises";
import { resolve, dirname } from "path";
import { hasCommand } from "../utils/shell.js";
import { getTemplatesRoot } from "../utils/paths.js";

export function checkClaude(): boolean {
  return hasCommand("claude");
}

/**
 * Run Claude to generate a plan. Returns plan markdown.
 */
export async function runPlan(
  goal: string,
  opts?: { cwd?: string; systemPromptPath?: string }
): Promise<string> {
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
    fullPrompt = systemPrompt.trim() + "\n\n---\n\nUser goal: " + goal;
  } catch {
    fullPrompt = "Produce a development plan with sections: Goal, Assumptions, Relevant Codebase Areas, Proposed Changes, Step-by-Step Plan, Files Likely to Change, Risks, Validation Checklist.\n\nUser goal: " + goal;
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
