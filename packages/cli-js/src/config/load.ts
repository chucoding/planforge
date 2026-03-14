/**
 * loadConfig: runtime only. Reads planforge.json; throws if missing (no template fallback).
 * getDefaultConfig: used only by init and config suggest. Reads templates/config/default-*.json.
 */

import { existsSync, readFileSync } from "fs";
import fs from "fs-extra";
import { resolve } from "path";
import { getTemplatesRoot } from "../utils/paths.js";
import type { PlanForgeConfig } from "./types.js";

/** Inline defaults used only when merging partial planforge.json (file exists). Not used when template is required. */
const MERGE_DEFAULTS: PlanForgeConfig = {
  planner: { provider: "claude", model: "claude-opus-4-6" },
  implementer: { provider: "codex", model: "gpt-5.4" },
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

/**
 * Default Doctor AI config (cheap models for workflow tests). Reads from templates/doctor/default-*.json.
 * Same file naming as config: default-both, default-claude-only, default-codex-only.
 */
export function getDefaultDoctorAiConfig(hasClaude: boolean, hasCodex: boolean): PlanForgeConfig {
  const fileName =
    hasClaude && hasCodex
      ? "default-both.json"
      : hasClaude
        ? "default-claude-only.json"
        : hasCodex
          ? "default-codex-only.json"
          : "default-claude-only.json";
  const filePath = resolve(getTemplatesRoot(), "doctor", fileName);
  if (!existsSync(filePath)) {
    throw new Error(`Missing doctor template: ${filePath}. Run from repo root or ensure templates exist.`);
  }
  try {
    const data = JSON.parse(readFileSync(filePath, "utf-8")) as PlanForgeConfig;
    return data;
  } catch (e) {
    throw new Error(`Missing or invalid template: ${filePath}. Run from repo root or ensure templates exist.`);
  }
}

/**
 * Load planforge.json for runtime commands (plan, implement, doctor). No template fallback.
 * Throws if planforge.json is missing; caller should direct user to planforge init.
 */
export async function loadConfig(projectRoot: string): Promise<PlanForgeConfig> {
  const configPath = resolve(projectRoot, "planforge.json");
  if (!(await fs.pathExists(configPath))) {
    throw new Error("planforge.json not found. Run planforge init.");
  }
  const loaded = (await fs.readJson(configPath)) as Partial<PlanForgeConfig>;
  const planner = (loaded.planner ?? {}) as Partial<PlanForgeConfig["planner"]>;
  const implementer = (loaded.implementer ?? {}) as Partial<PlanForgeConfig["implementer"]>;
  return {
    planner: { ...MERGE_DEFAULTS.planner, ...planner, provider: planner.provider ?? MERGE_DEFAULTS.planner.provider },
    implementer: { ...MERGE_DEFAULTS.implementer, ...implementer, provider: implementer.provider ?? MERGE_DEFAULTS.implementer.provider },
  };
}
