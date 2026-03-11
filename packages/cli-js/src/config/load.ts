/**
 * Load planforge.json or fall back to default config for current providers.
 * Default config is read from templates/config/default-*.json; missing or invalid template throws.
 */

import { existsSync, readFileSync } from "fs";
import fs from "fs-extra";
import { resolve } from "path";
import { getTemplatesRoot } from "../utils/paths.js";
import { checkClaude } from "../providers/claude.js";
import { checkCodex } from "../providers/codex.js";
import type { PlanForgeConfig } from "./types.js";

/**
 * Default config when planforge.json is missing. Reads from templates/config/default-*.json.
 * Throws if the template file is missing or invalid.
 */
export function getDefaultConfig(hasClaude: boolean, hasCodex: boolean): PlanForgeConfig {
  const fileName =
    hasClaude && hasCodex
      ? "default-both.json"
      : hasClaude
        ? "default-claude-only.json"
        : hasCodex
          ? "default-codex-only.json"
          : "default-claude-only.json";
  const filePath = resolve(getTemplatesRoot(), "config", fileName);
  if (!existsSync(filePath)) {
    throw new Error(`Missing or invalid template: ${filePath}. Run from repo root or ensure templates exist.`);
  }
  try {
    const data = JSON.parse(readFileSync(filePath, "utf-8")) as PlanForgeConfig;
    return data;
  } catch (e) {
    throw new Error(`Missing or invalid template: ${filePath}. Run from repo root or ensure templates exist.`);
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
