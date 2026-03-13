/**
 * planforge model - interactive mode => provider => model selection with effort/reasoning
 */

import { existsSync } from "fs";
import fs from "fs-extra";
import { resolve } from "path";
import { getProjectRoot, getModelsJsonPath } from "../utils/paths.js";
import { checkClaude } from "../providers/claude.js";
import { checkCodex } from "../providers/codex.js";
import type { PlanForgeConfig } from "../config/types.js";

interface ModelsCatalog {
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

function loadModelsCatalog(): ModelsCatalog {
  const path = getModelsJsonPath();
  const fallback = resolve(getProjectRoot(), "packages", "core", "models.json");
  const filePath = existsSync(path) ? path : existsSync(fallback) ? fallback : null;
  if (!filePath) {
    throw new Error(
      `models.json not found. Tried: ${path} and ${fallback}. Check @planforge/core package or run from repo root.`
    );
  }
  return fs.readJsonSync(filePath) as ModelsCatalog;
}

type KeyAction = "up" | "down" | "left" | "right" | "enter" | "quit" | null;

function waitKey(): Promise<KeyAction> {
  return new Promise((resolveKey) => {
    if (!process.stdin.isTTY) {
      resolveKey(null);
      return;
    }
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    let buf = "";

    const resolveAndClean = (action: KeyAction) => {
      cleanup();
      resolveKey(action);
    };

    const onData = (chunk: string | Buffer) => {
      buf += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      const s = buf;

      if (s === "\r" || s === "\n") {
        buf = "";
        resolveAndClean("enter");
        return;
      }
      if (s === "\u0003") {
        buf = "";
        resolveAndClean("quit");
        return;
      }
      // Arrow keys: full sequence (e.g. \x1b[A) or split (\x1b then [ then A)
      if (s.startsWith("\x1b[") && s.length >= 3) {
        const c = s[2];
        buf = s.length > 3 ? s.slice(3) : "";
        if (c === "A") resolveAndClean("up");
        else if (c === "B") resolveAndClean("down");
        else if (c === "C") resolveAndClean("right");
        else if (c === "D") resolveAndClean("left");
        else resolveAndClean(null);
        return;
      }
      if (s === "\x1b" || (s.startsWith("\x1b[") && s.length < 3)) {
        return;
      }
      // Single char
      if (s.length >= 1) {
        const first = s[0];
        buf = s.slice(1);
        if (first === "w" || first === "k") resolveAndClean("up");
        else if (first === "s" || first === "j") resolveAndClean("down");
        else if (first === "a" || first === "h") resolveAndClean("left");
        else if (first === "d" || first === "l") resolveAndClean("right");
        else resolveAndClean(null);
        return;
      }
    };

    const cleanup = () => {
      process.stdin.removeListener("data", onData);
      if (!wasRaw) process.stdin.setRawMode?.(false);
    };

    process.stdin.on("data", onData);
  });
}

async function runModelTui(
  catalog: ModelsCatalog,
  hasClaude: boolean,
  hasCodex: boolean
): Promise<{ mode: string; config: Record<string, string> } | null> {
  const { modes, modeProviders, providers } = catalog;

  // Step 1: mode
  let modeIndex = 0;
  console.log("\n  Mode: [Up/Down]  Enter to confirm\n");
  while (true) {
    for (let i = 0; i < modes.length; i++) {
      console.log((i === modeIndex ? "  > " : "    ") + modes[i]);
    }
    const key = await waitKey();
    if (key === "quit") return null;
    if (key === "enter") break;
    if (key === "up") modeIndex = (modeIndex - 1 + modes.length) % modes.length;
    if (key === "down") modeIndex = (modeIndex + 1) % modes.length;
    if (key === "up" || key === "down") {
      process.stdout.write(`\x1b[${modes.length}A\x1b[0J`);
    }
  }
  const mode = modes[modeIndex];
  const providerIds = modeProviders[mode] ?? Object.keys(providers);
  const available = providerIds.filter(
    (p) => (p === "claude" && hasClaude) || (p === "codex" && hasCodex)
  );
  if (available.length === 0) {
    console.error("No provider available for this mode. Install Claude or Codex CLI.");
    return null;
  }

  // Step 2: provider (skip if single)
  let providerId: string;
  if (available.length === 1) {
    providerId = available[0];
  } else {
    let provIndex = 0;
    console.log("\n  Provider: [Up/Down]  Enter to confirm\n");
    while (true) {
      for (let i = 0; i < available.length; i++) {
        const name = providers[available[i]]?.name ?? available[i];
        console.log((i === provIndex ? "  > " : "    ") + `${name} (${available[i]})`);
      }
      const key = await waitKey();
      if (key === "quit") return null;
      if (key === "enter") break;
      if (key === "up") provIndex = (provIndex - 1 + available.length) % available.length;
      if (key === "down") provIndex = (provIndex + 1) % available.length;
      if (key === "up" || key === "down") {
        process.stdout.write(`\x1b[${available.length}A\x1b[0J`);
      }
    }
    providerId = available[provIndex];
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

  // Step 3a: model selection (Up/Down, Enter to confirm)
  let modelIndex = 0;
  console.log("\n  [Up/Down] model  Enter to confirm\n");
  while (true) {
    for (let i = 0; i < models.length; i++) {
      console.log((i === modelIndex ? "  > " : "    ") + `${models[i].label} (${models[i].id})`);
    }
    const key = await waitKey();
    if (key === "quit") return null;
    if (key === "enter") break;
    if (key === "up") modelIndex = (modelIndex - 1 + models.length) % models.length;
    if (key === "down") modelIndex = (modelIndex + 1) % models.length;
    process.stdout.write(`\x1b[${models.length}A\x1b[0J`);
  }

  // Step 3b: Effort (Claude) or Reasoning (Codex) selection (Up/Down, Enter to confirm)
  const opts = isClaude ? effortOpts : reasoningOpts;
  const label = isClaude ? "Effort" : "Reasoning";
  let optIndex = Math.min(1, opts.length - 1);
  console.log(`\n  [Up/Down] ${label}  Enter to confirm\n`);
  while (true) {
    for (let i = 0; i < opts.length; i++) {
      console.log((i === optIndex ? "  > " : "    ") + opts[i]);
    }
    const key = await waitKey();
    if (key === "quit") return null;
    if (key === "enter") break;
    if (key === "up") optIndex = (optIndex - 1 + opts.length) % opts.length;
    if (key === "down") optIndex = (optIndex + 1) % opts.length;
    process.stdout.write(`\x1b[${opts.length}A\x1b[0J`);
  }

  const config: Record<string, string> = {
    provider: providerId,
    model: models[modelIndex].id,
  };
  if (isClaude) config.effort = effortOpts[optIndex];
  else config.reasoning = reasoningOpts[optIndex];
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

  if (!process.stdin.isTTY) {
    console.error("planforge model requires an interactive terminal.");
    process.exit(1);
  }

  const selected = await runModelTui(catalog, hasClaude, hasCodex);
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
