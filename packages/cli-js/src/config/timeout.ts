/**
 * Resolve stream timeout (seconds) from planner/implementer config.
 * 0 means no timeout. When streamTimeoutSec is not set, use effort-based default (planner) or 300 (implementer).
 */

import type { PlanForgeConfig } from "./types.js";

/** Default seconds by planner effort when streamTimeoutSec is not set. */
const PLANNER_EFFORT_DEFAULT_SEC: Record<string, number> = {
  high: 360,
  medium: 180,
  low: 120,
};

const IMPLEMENTER_DEFAULT_SEC = 300;

/**
 * Resolve planner stream timeout in seconds. 0 = no timeout.
 */
export function resolvePlannerStreamTimeoutSec(planner: PlanForgeConfig["planner"]): number {
  if (planner.streamTimeoutSec !== undefined && planner.streamTimeoutSec !== null) {
    return Math.max(0, Number(planner.streamTimeoutSec));
  }
  const effort = (planner.effort ?? "").toLowerCase();
  return PLANNER_EFFORT_DEFAULT_SEC[effort] ?? 120;
}

/**
 * Resolve implementer stream timeout in seconds. 0 = no timeout.
 */
export function resolveImplementerStreamTimeoutSec(implementer: PlanForgeConfig["implementer"]): number {
  if (implementer.streamTimeoutSec !== undefined && implementer.streamTimeoutSec !== null) {
    return Math.max(0, Number(implementer.streamTimeoutSec));
  }
  const effort = (implementer.effort ?? "").toLowerCase();
  return PLANNER_EFFORT_DEFAULT_SEC[effort] ?? IMPLEMENTER_DEFAULT_SEC;
}
