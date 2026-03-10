/**
 * Read provider-specific instruction files from project root for plan/implement context.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const MAX_PROJECT_CONTEXT_CHARS = 3500;

export type InstructionFileName = "AGENTS.md" | "CLAUDE.md";

export interface ProjectContextResult {
  content?: string;
  source?: InstructionFileName;
}

export function getPreferredInstructionFile(provider: string): InstructionFileName | undefined {
  if (provider === "codex") return "AGENTS.md";
  if (provider === "claude") return "CLAUDE.md";
  return undefined;
}

function getInstructionCandidates(provider: string): InstructionFileName[] {
  const preferred = getPreferredInstructionFile(provider);
  if (preferred === "AGENTS.md") return ["AGENTS.md", "CLAUDE.md"];
  if (preferred === "CLAUDE.md") return ["CLAUDE.md", "AGENTS.md"];
  return ["AGENTS.md", "CLAUDE.md"];
}

/**
 * Read project context from the provider-preferred instruction file, with fallback to the other file.
 */
export function getProjectContext(projectRoot: string, provider: string): ProjectContextResult {
  for (const name of getInstructionCandidates(provider)) {
    const path = join(projectRoot, name);
    try {
      if (!existsSync(path)) continue;
      const content = readFileSync(path, "utf-8").trim();
      if (!content) continue;
      if (content.length > MAX_PROJECT_CONTEXT_CHARS) {
        return {
          content: content.slice(0, MAX_PROJECT_CONTEXT_CHARS) + "\n...(truncated)",
          source: name,
        };
      }
      return { content, source: name };
    } catch {
      /* skip */
    }
  }
  return {};
}
