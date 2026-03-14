/**
 * Provider registry: route plan/implement by provider name from planforge.json.
 * Add new providers here and implement check + runPlan/runImplement in their module.
 */

import * as claude from "./claude.js";
import * as codex from "./codex.js";

export interface PlanOpts {
  cwd: string;
  systemPromptPath?: string;
  context?: string;
  repoContext?: string;
  /** Project context from AGENTS.md (or CLAUDE.md). Capped in size. */
  projectContext?: string;
  /** Source file for projectContext, e.g. AGENTS.md or CLAUDE.md. */
  projectContextSource?: string;
}

export interface ImplementOpts {
  cwd: string;
  planPath?: string;
  planContent?: string;
  systemPromptPath?: string;
  context?: string;
  /** File paths or globs to focus on (from plan or --files). */
  filesToChange?: string[];
  /** Concatenated file contents for context (capped in size). */
  codeContext?: string;
  /** Project context from AGENTS.md (or CLAUDE.md). Capped in size. */
  projectContext?: string;
  /** Source file for projectContext, e.g. AGENTS.md or CLAUDE.md. */
  projectContextSource?: string;
  /** Recent commit (oneline) per file for files to focus on. Capped in size. */
  recentCommitsPerFile?: string;
}

export interface PlannerRunner {
  check(): boolean;
  runPlan(goal: string, opts: PlanOpts): Promise<string>;
}

export interface ImplementerRunner {
  check(): boolean;
  runImplement(prompt: string, opts: ImplementOpts): Promise<string>;
}

export interface OneTurnRunner {
  completeOneTurn(systemPrompt: string, userMessage: string, opts?: { cwd?: string; model?: string }): Promise<string>;
  streamOneTurn(
    systemPrompt: string,
    userMessage: string,
    onChunk: (chunk: string) => void,
    opts?: { cwd?: string; model?: string }
  ): Promise<string>;
}

const claudePlanner: PlannerRunner = {
  check: () => claude.checkClaude(),
  runPlan: (goal, opts) => claude.runPlan(goal, opts),
};

const codexPlanner: PlannerRunner = {
  check: () => codex.checkCodex(),
  runPlan: (goal, opts) => codex.runPlan(goal, opts),
};

const claudeImplementer: ImplementerRunner = {
  check: () => claude.checkClaude(),
  runImplement: (prompt, opts) => claude.runImplement(prompt, opts),
};

const codexImplementer: ImplementerRunner = {
  check: () => codex.checkCodex(),
  runImplement: (prompt, opts) => codex.runImplement(prompt, opts),
};

export function getPlannerRunner(provider: string): PlannerRunner | null {
  switch (provider) {
    case "claude":
      return claudePlanner;
    case "codex":
      return codexPlanner;
    default:
      return null;
  }
}

export function getImplementerRunner(provider: string): ImplementerRunner | null {
  switch (provider) {
    case "claude":
      return claudeImplementer;
    case "codex":
      return codexImplementer;
    default:
      return null;
  }
}

export function getOneTurnRunner(provider: string): OneTurnRunner | null {
  switch (provider) {
    case "claude":
      return {
        completeOneTurn: claude.completeOneTurn,
        streamOneTurn: claude.streamOneTurn,
      };
    case "codex":
      return {
        completeOneTurn: codex.completeOneTurn,
        streamOneTurn: codex.streamOneTurn,
      };
    default:
      return null;
  }
}
