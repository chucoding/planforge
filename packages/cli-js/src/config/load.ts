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

/** Inline defaults used only when merging partial planforge.json (file exists). Not used when template is required. */
const MERGE_DEFAULTS: PlanForgeConfig = {
  planner: { provider: "claude", model: "claude-opus-4-6" },
  implementer: { provider: "codex", model: "gpt-5.4" },
  plansDir: ".cursor/plans",
  contextDir: ".cursor/context",
};

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
  const configPath = resolve(projectRoot, "planforge.json");
  if (await fs.pathExists(configPath)) {
    const loaded = (await fs.readJson(configPath)) as Partial<PlanForgeConfig>;
    const planner = (loaded.planner ?? {}) as Partial<PlanForgeConfig["planner"]>;
    const implementer = (loaded.implementer ?? {}) as Partial<PlanForgeConfig["implementer"]>;
    return {
      planner: { ...MERGE_DEFAULTS.planner, ...planner, provider: planner.provider ?? MERGE_DEFAULTS.planner.provider },
      implementer: { ...MERGE_DEFAULTS.implementer, ...implementer, provider: implementer.provider ?? MERGE_DEFAULTS.implementer.provider },
      plansDir: loaded.plansDir ?? MERGE_DEFAULTS.plansDir,
      contextDir: loaded.contextDir ?? MERGE_DEFAULTS.contextDir,
    };
  }
  const hasClaude = checkClaude();
  const hasCodex = checkCodex();
  return getDefaultConfig(hasClaude, hasCodex);
}
