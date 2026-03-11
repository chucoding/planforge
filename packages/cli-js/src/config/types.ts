/**
 * planforge.json config type.
 */

export interface PlanForgeConfig {
  planner: { provider: string; model: string; effort?: string; reasoning?: string; asciiSlug?: boolean };
  implementer: { provider: string; model: string; effort?: string; reasoning?: string };
  plansDir: string;
  contextDir: string;
}
