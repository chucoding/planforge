/**
 * Codex provider - implementation (e.g. /i)
 */

import { hasCommand } from "../utils/shell.js";

/** npm package for global install: npm install -g @openai/codex */
export const CLIENT_NPM_PACKAGE = "@openai/codex";

export function checkCodex(): boolean {
  return hasCommand("codex");
}

export async function runImplement(prompt: string, _opts?: Record<string, unknown>): Promise<string> {
  // TODO: call Codex for implementation (v0.2)
  return prompt;
}
