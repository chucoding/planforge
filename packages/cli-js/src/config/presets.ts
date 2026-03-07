/**
 * planforge.json presets per provider combination (both / claude-only / codex-only)
 */

export interface PlanForgeConfig {
  planner: { provider: string; model: string; effort?: string; reasoning?: string; asciiSlug?: boolean };
  implementer: { provider: string; model: string; effort?: string; reasoning?: string };
  plansDir: string;
}

const PRESET_BOTH: PlanForgeConfig = {
  planner: { provider: "claude", model: "claude-opus-4-6", effort: "high" },
  implementer: { provider: "codex", model: "gpt-5.4" },
  plansDir: ".cursor/plans",
};

const PRESET_CLAUDE_ONLY: PlanForgeConfig = {
  planner: { provider: "claude", model: "claude-opus-4-6", effort: "high" },
  implementer: { provider: "claude", model: "claude-sonnet-4-6", effort: "medium" },
  plansDir: ".cursor/plans",
};

const PRESET_CODEX_ONLY: PlanForgeConfig = {
  planner: { provider: "codex", model: "gpt-5.4", reasoning: "high" },
  implementer: { provider: "codex", model: "gpt-5.4", reasoning: "low" },
  plansDir: ".cursor/plans",
};

/**
 * Return the recommended preset for the given installed providers.
 * Both -> p=Claude Opus 4.6, i=Codex 5.4; Claude only -> p=Opus, i=Sonnet; Codex only -> p/i=GPT-5.4 with different reasoning.
 */
export function getPresetForProviders(hasClaude: boolean, hasCodex: boolean): PlanForgeConfig {
  if (hasClaude && hasCodex) return PRESET_BOTH;
  if (hasClaude) return PRESET_CLAUDE_ONLY;
  if (hasCodex) return PRESET_CODEX_ONLY;
  return PRESET_CLAUDE_ONLY;
}
