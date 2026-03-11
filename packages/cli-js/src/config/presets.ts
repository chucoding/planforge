/**
 * planforge.json config type and default config when planforge.json is missing.
 */

export interface PlanForgeConfig {
  planner: { provider: string; model: string; effort?: string; reasoning?: string; asciiSlug?: boolean };
  implementer: { provider: string; model: string; effort?: string; reasoning?: string };
  plansDir: string;
  contextDir: string;
}

const DEFAULT_BOTH: PlanForgeConfig = {
  planner: { provider: "claude", model: "claude-opus-4-6", effort: "high" },
  implementer: { provider: "codex", model: "gpt-5.4" },
  plansDir: ".cursor/plans",
  contextDir: ".cursor/context",
};

const DEFAULT_CLAUDE_ONLY: PlanForgeConfig = {
  planner: { provider: "claude", model: "claude-opus-4-6", effort: "high" },
  implementer: { provider: "claude", model: "claude-sonnet-4-6", effort: "medium" },
  plansDir: ".cursor/plans",
  contextDir: ".cursor/context",
};

const DEFAULT_CODEX_ONLY: PlanForgeConfig = {
  planner: { provider: "codex", model: "gpt-5.4", reasoning: "high" },
  implementer: { provider: "codex", model: "gpt-5.4", reasoning: "low" },
  plansDir: ".cursor/plans",
  contextDir: ".cursor/context",
};

/**
 * Default config when planforge.json is missing. Based on installed providers.
 */
export function getDefaultConfig(hasClaude: boolean, hasCodex: boolean): PlanForgeConfig {
  if (hasClaude && hasCodex) return DEFAULT_BOTH;
  if (hasClaude) return DEFAULT_CLAUDE_ONLY;
  if (hasCodex) return DEFAULT_CODEX_ONLY;
  return DEFAULT_CLAUDE_ONLY;
}
