/**
 * Load planforge.json or fall back to default config for current providers.
 */

import fs from "fs-extra";
import { resolve } from "path";
import { getDefaultConfig, type PlanForgeConfig } from "./presets.js";
import { checkClaude } from "../providers/claude.js";
import { checkCodex } from "../providers/codex.js";

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
