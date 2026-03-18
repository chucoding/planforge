/**
 * planforge.json config type.
 */

export interface PlanForgeConfig {
  planner: { provider: string; model: string; effort?: string; reasoning?: string; asciiSlug?: boolean; streamTimeoutSec?: number };
  implementer: { provider: string; model: string; effort?: string; reasoning?: string; streamTimeoutSec?: number };
}
