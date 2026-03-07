/**
 * Read AGENTS.md or CLAUDE.md from project root for plan/implement context. Capped in size.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const MAX_PROJECT_CONTEXT_CHARS = 3500;
const CANDIDATES = ["AGENTS.md", "CLAUDE.md"] as const;

/**
 * Read project context from AGENTS.md or CLAUDE.md (first existing). Returns undefined if none found or on error.
 */
export function getProjectContext(projectRoot: string): string | undefined {
  for (const name of CANDIDATES) {
    const path = join(projectRoot, name);
    try {
      if (!existsSync(path)) continue;
      const content = readFileSync(path, "utf-8").trim();
      if (!content) continue;
      if (content.length > MAX_PROJECT_CONTEXT_CHARS) {
        return content.slice(0, MAX_PROJECT_CONTEXT_CHARS) + "\n...(truncated)";
      }
      return content;
    } catch {
      /* skip */
    }
  }
  return undefined;
}
