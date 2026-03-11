/**
 * Load planforge.json or fall back to default config for current providers.
 */

import { readFileSync } from "fs";
import fs from "fs-extra";
import { resolve } from "path";
import { getTemplatesRoot } from "../utils/paths.js";
import { checkClaude } from "../providers/claude.js";
import { checkCodex } from "../providers/codex.js";
import type { PlanForgeConfig } from "./types.js";

const DEFAULT_CONFIGS: Record<string, PlanForgeConfig> = {
  both: {
    planner: { provider: "claude", model: "claude-opus-4-6", effort: "high" },
    implementer: { provider: "codex", model: "gpt-5.4" },
    plansDir: ".cursor/plans",
    contextDir: ".cursor/context",
  },
  claudeOnly: {
    planner: { provider: "claude", model: "claude-opus-4-6", effort: "high" },
    implementer: { provider: "claude", model: "claude-sonnet-4-6", effort: "medium" },
    plansDir: ".cursor/plans",
    contextDir: ".cursor/context",
  },
  codexOnly: {
    planner: { provider: "codex", model: "gpt-5.4", reasoning: "high" },
    implementer: { provider: "codex", model: "gpt-5.4", reasoning: "low" },
    plansDir: ".cursor/plans",
    contextDir: ".cursor/context",
  },
};

/**
 * Default config when planforge.json is missing. Reads from templates/config/default-*.json when present.
 */
export function getDefaultConfig(hasClaude: boolean, hasCodex: boolean): PlanForgeConfig {
  let key: keyof typeof DEFAULT_CONFIGS;
  if (hasClaude && hasCodex) key = "both";
  else if (hasClaude) key = "claudeOnly";
  else if (hasCodex) key = "codexOnly";
  else key = "claudeOnly";

  const fileName = key === "both" ? "default-both.json" : key === "claudeOnly" ? "default-claude-only.json" : "default-codex-only.json";
  const filePath = resolve(getTemplatesRoot(), "config", fileName);
  try {
    const data = JSON.parse(readFileSync(filePath, "utf-8")) as PlanForgeConfig;
    return data;
  } catch {
    return DEFAULT_CONFIGS[key];
  }
}

export async function loadConfig(projectRoot: string): Promise<PlanForgeConfig> {
  const hasClaude = checkClaude();
  const hasCodex = checkCodex();
  const defaultConfig = getDefaultConfig(hasClaude, hasCodex);
  const configPath = resolve(projectRoot, "planforge.json");
  if (await fs.pathExists(configPath)) {
    const loaded = (await fs.readJson(configPath)) as Partial<PlanForgeConfig>;
    const planner = (loaded.planner ?? {}) as Partial<PlanForgeConfig["planner"]>;
    const implementer = (loaded.implementer ?? {}) as Partial<PlanForgeConfig["implementer"]>;
    return {
      planner: { ...defaultConfig.planner, ...planner, provider: planner.provider ?? defaultConfig.planner.provider },
      implementer: { ...defaultConfig.implementer, ...implementer, provider: implementer.provider ?? defaultConfig.implementer.provider },
      plansDir: loaded.plansDir ?? defaultConfig.plansDir,
      contextDir: loaded.contextDir ?? defaultConfig.contextDir,
    };
  }
  return defaultConfig;
}
