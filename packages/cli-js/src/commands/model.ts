/**
 * planforge model - interactive mode => provider => model selection with effort/reasoning
 */

import { existsSync } from "fs";
import fs from "fs-extra";
import { resolve } from "path";
import { getProjectRoot, getModelsJsonPath } from "../utils/paths.js";
import { printCurrentAiConfig, selectFromList } from "../utils/tui.js";
import { checkClaude } from "../providers/claude.js";
import { checkCodex } from "../providers/codex.js";
import { getDefaultConfig } from "../config/load.js";
import type { PlanForgeConfig } from "../config/types.js";

export interface ModelsCatalog {
  modes: string[];
  modeProviders: Record<string, string[]>;
  providers: Record<
    string,
    {
      name: string;
      models: { id: string; label: string }[];
      effort?: string[];
      reasoning?: string[];
    }
  >;
}

export function loadModelsCatalog(): ModelsCatalog {
  const path = getModelsJsonPath();
  const fallback = resolve(getProjectRoot(), "packages", "core", "models.json");
  const filePath = existsSync(path) ? path : existsSync(fallback) ? fallback : null;
  if (!filePath) {
    throw new Error(
      `models.json not found. Tried: ${path} and ${fallback}. Run pnpm run build in cli-js or reinstall planforge.`
    );
  }
  return fs.readJsonSync(filePath) as ModelsCatalog;
}

/** Exported for planforge model: interactive mode => provider => model selection with effort/reasoning. */
export async function runModelTui(
  catalog: ModelsCatalog,
  hasClaude: boolean,
  hasCodex: boolean,
  defaultConfig?: PlanForgeConfig
): Promise<{ mode: string; config: Record<string, string> } | null> {
  const { modes, modeProviders, providers } = catalog;

  const mode = await selectFromList(
    modes.map((m) => ({ label: m, value: m })),
    "Mode: [Up/Down]  Enter to confirm"
  );
  if (mode === null) return null;

  const providerIds = modeProviders[mode] ?? Object.keys(providers);
  const available = providerIds.filter(
    (p) => (p === "claude" && hasClaude) || (p === "codex" && hasCodex)
  );
  if (available.length === 0) {
    console.error("No provider available for this mode. Install Claude or Codex CLI.");
    return null;
  }

  let providerId: string;
  if (available.length === 1) {
    providerId = available[0];
  } else {
    const chosen = await selectFromList(
      available.map((id) => ({
        label: `${providers[id]?.name ?? id} (${id})`,
        value: id,
      })),
      "Provider: [Up/Down]  Enter to confirm"
    );
    if (chosen === null) return null;
    providerId = chosen;
  }

  const prov = providers[providerId];
  const models = prov?.models ?? [];
  const isClaude = providerId === "claude";
  const effortOpts = prov?.effort ?? ["low", "medium", "high"];
  const reasoningOpts = prov?.reasoning ?? ["none", "low", "medium", "high"];
  if (models.length === 0) {
    console.error("No models defined for this provider.");
    return null;
  }

  const defaultModelId =
    defaultConfig &&
    (mode === "planner" && defaultConfig.planner.provider === providerId
      ? defaultConfig.planner.model
      : mode === "implementer" && defaultConfig.implementer.provider === providerId
        ? defaultConfig.implementer.model
        : undefined);

  const modelId = await selectFromList(
    models.map((m) => ({
      label: `${m.label} (${m.id})${defaultModelId != null && m.id === defaultModelId ? "  (recommended)" : ""}`,
      value: m.id,
    })),
    "[Up/Down] model  Enter to confirm"
  );
  if (modelId === null) return null;

  const selectedModel = models.find((m) => m.id === modelId) as
    | { id: string; label: string; effort?: boolean }
    | undefined;
  const claudeSupportsEffort = isClaude && selectedModel?.effort !== false;
  const opts = isClaude ? (claudeSupportsEffort ? effortOpts : []) : reasoningOpts;
  const optLabel = isClaude ? "Effort" : "Reasoning";

  let selectedOpt: string | null = null;
  if (opts.length > 0) {
    selectedOpt = await selectFromList(
      opts.map((o) => ({ label: o, value: o })),
      `[Up/Down] ${optLabel}  Enter to confirm`,
      { initialIndex: Math.min(1, opts.length - 1) }
    );
    if (selectedOpt === null) return null;
  }

  const config: Record<string, string> = {
    provider: providerId,
    model: modelId,
  };
  if (isClaude && claudeSupportsEffort && selectedOpt != null) config.effort = selectedOpt;
  else if (!isClaude && selectedOpt != null) config.reasoning = selectedOpt;
  return { mode, config };
}

export async function runModel(_args: string[]): Promise<void> {
  const projectRoot = getProjectRoot();
  const configPath = resolve(projectRoot, "planforge.json");

  let catalog: ModelsCatalog;
  try {
    catalog = loadModelsCatalog();
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }

  const hasClaude = checkClaude();
  const hasCodex = checkCodex();
  let defaultConfig: PlanForgeConfig | undefined;
  try {
    defaultConfig = getDefaultConfig(hasClaude, hasCodex);
  } catch {
    defaultConfig = undefined;
  }

  if (!process.stdin.isTTY) {
    console.error("planforge model requires an interactive terminal.");
    process.exit(1);
  }

  if (await fs.pathExists(configPath)) {
    try {
      const data = (await fs.readJson(configPath)) as PlanForgeConfig;
      printCurrentAiConfig(data);
    } catch {
      // ignore; do not block model TUI
    }
  }

  const selected = await runModelTui(catalog, hasClaude, hasCodex, defaultConfig);
  if (selected === null) {
    process.exit(0);
  }

  const { mode, config } = selected;
  let data: PlanForgeConfig;
  if (await fs.pathExists(configPath)) {
    try {
      data = (await fs.readJson(configPath)) as PlanForgeConfig;
    } catch (e) {
      console.error("Could not read planforge.json:", (e as Error).message);
      process.exit(1);
    }
  } else {
    data = {
      planner: { provider: "codex", model: "gpt-5.4" },
      implementer: { provider: "codex", model: "gpt-5.4" },
    };
  }

  const roleConfig: PlanForgeConfig["planner"] = { provider: config.provider, model: config.model };
  if (config.effort != null) roleConfig.effort = config.effort;
  if (config.reasoning != null) roleConfig.reasoning = config.reasoning;
  if (mode === "planner") {
    data.planner = roleConfig;
  } else {
    data.implementer = roleConfig;
  }
  await fs.writeJson(configPath, data, { spaces: 2 });
  const extra = config.effort != null ? ` (effort: ${config.effort})` : config.reasoning != null ? ` (reasoning: ${config.reasoning})` : "";
  console.log(`\nUpdated planforge.json: ${mode} -> ${config.provider} / ${config.model}${extra}`);
  process.exit(0);
}
