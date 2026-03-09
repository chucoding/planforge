/**
 * planforge config - show or suggest planforge.json
 */

import fs from "fs-extra";
import { resolve } from "path";
import { getProjectRoot } from "../utils/paths.js";
import { checkClaude } from "../providers/claude.js";
import { checkCodex } from "../providers/codex.js";
import {
  getPresetForProviders,
  type PlanForgeConfig,
} from "../config/presets.js";

export function formatRole(config: PlanForgeConfig, role: "planner" | "implementer"): string {
  const r = config[role];
  const parts = [r.provider, r.model];
  if (r.effort) parts.push(`effort:${r.effort}`);
  if (r.reasoning) parts.push(`reasoning:${r.reasoning}`);
  return parts.join(" / ");
}

export function configEqual(a: PlanForgeConfig, b: PlanForgeConfig): boolean {
  return (
    JSON.stringify(a.planner) === JSON.stringify(b.planner) &&
    JSON.stringify(a.implementer) === JSON.stringify(b.implementer) &&
    a.plansDir === b.plansDir &&
    a.contextDir === b.contextDir
  );
}

export async function runConfigShow(_args: string[]): Promise<void> {
  const projectRoot = getProjectRoot();
  const configPath = resolve(projectRoot, "planforge.json");
  if (!(await fs.pathExists(configPath))) {
    console.log("Run planforge init first.");
    return;
  }
  const content = await fs.readFile(configPath, "utf-8");
  console.log(content);
}

export async function runConfigSuggest(args: string[]): Promise<void> {
  const apply = args.includes("--apply");
  const projectRoot = getProjectRoot();
  const configPath = resolve(projectRoot, "planforge.json");

  const hasClaude = checkClaude();
  const hasCodex = checkCodex();
  const suggested = getPresetForProviders(hasClaude, hasCodex);

  if (!(await fs.pathExists(configPath))) {
    console.log("No planforge.json found. Suggested config for your installed providers:\n");
    console.log(JSON.stringify(suggested, null, 2));
    if (apply) {
      await fs.writeJson(configPath, suggested, { spaces: 2 });
      console.log("\nCreated planforge.json");
    }
    return;
  }

  const current = (await fs.readJson(configPath)) as PlanForgeConfig;
  if (configEqual(current, suggested)) {
    console.log("Your planforge.json already matches the recommended config for your providers.");
    return;
  }

  console.log("\nConfig comparison (installed providers: Claude " + (hasClaude ? "yes" : "no") + ", Codex " + (hasCodex ? "yes" : "no") + ")\n");
  console.log("  Current:   planner   " + formatRole(current, "planner"));
  console.log("             implementer " + formatRole(current, "implementer"));
  console.log("");
  console.log("  Suggested: planner   " + formatRole(suggested, "planner"));
  console.log("             implementer " + formatRole(suggested, "implementer"));
  console.log("");

  if (apply) {
    await fs.writeJson(configPath, suggested, { spaces: 2 });
    console.log("Updated planforge.json to suggested config.");
  } else {
    console.log("Run planforge config suggest --apply to update planforge.json.");
  }
}
