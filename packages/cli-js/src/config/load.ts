/**
 * Load planforge.json or fall back to preset for current providers.
 */

import fs from "fs-extra";
import { resolve } from "path";
import { getPresetForProviders, type PlanForgeConfig } from "./presets.js";
import { checkClaude } from "../providers/claude.js";
import { checkCodex } from "../providers/codex.js";

export async function loadConfig(projectRoot: string): Promise<PlanForgeConfig> {
  const configPath = resolve(projectRoot, "planforge.json");
  if (await fs.pathExists(configPath)) {
    return (await fs.readJson(configPath)) as PlanForgeConfig;
  }
  const hasClaude = checkClaude();
  const hasCodex = checkCodex();
  return getPresetForProviders(hasClaude, hasCodex);
}
