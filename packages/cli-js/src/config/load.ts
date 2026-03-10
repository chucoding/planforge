/**
 * Load planforge.json or fall back to preset for current providers.
 */

import fs from "fs-extra";
import { resolve } from "path";
import { getPresetForProviders, type PlanForgeConfig } from "./presets.js";
import { checkClaude } from "../providers/claude.js";
import { checkCodex } from "../providers/codex.js";

export async function loadConfig(projectRoot: string): Promise<PlanForgeConfig> {
  const hasClaude = checkClaude();
  const hasCodex = checkCodex();
  const preset = getPresetForProviders(hasClaude, hasCodex);
  const configPath = resolve(projectRoot, "planforge.json");
  if (await fs.pathExists(configPath)) {
    const loaded = (await fs.readJson(configPath)) as Partial<PlanForgeConfig>;
    const planner = (loaded.planner ?? {}) as Partial<PlanForgeConfig["planner"]>;
    const implementer = (loaded.implementer ?? {}) as Partial<PlanForgeConfig["implementer"]>;
    return {
      planner: { ...preset.planner, ...planner, provider: planner.provider ?? preset.planner.provider },
      implementer: { ...preset.implementer, ...implementer, provider: implementer.provider ?? preset.implementer.provider },
      plansDir: loaded.plansDir ?? preset.plansDir,
      contextDir: loaded.contextDir ?? preset.contextDir,
    };
  }
  return preset;
}
