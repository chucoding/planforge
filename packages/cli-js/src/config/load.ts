/**
 * loadConfig: runtime only. Reads planforge.json and merges with template (default-*.json) by installed providers.
 * getDefaultConfig: reads templates/config/default-*.json for init, config suggest, and as merge base in loadConfig.
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

/**
 * Load planforge.json for runtime commands (plan, implement, doctor). Merges with template (default-*.json) by installed providers.
 * Throws if planforge.json is missing; caller should direct user to planforge init.
 */
export async function loadConfig(projectRoot: string): Promise<PlanForgeConfig> {
  const configPath = resolve(projectRoot, "planforge.json");
  if (!(await fs.pathExists(configPath))) {
    throw new Error("planforge.json not found. Run planforge init.");
  }
  const mergeBase = getDefaultConfig(checkClaude(), checkCodex());
  const loaded = (await fs.readJson(configPath)) as Partial<PlanForgeConfig>;
  const planner = (loaded.planner ?? {}) as Partial<PlanForgeConfig["planner"]>;
  const implementer = (loaded.implementer ?? {}) as Partial<PlanForgeConfig["implementer"]>;
  return {
    planner: { ...mergeBase.planner, ...planner, provider: planner.provider ?? mergeBase.planner.provider },
    implementer: { ...mergeBase.implementer, ...implementer, provider: implementer.provider ?? mergeBase.implementer.provider },
  };
}
