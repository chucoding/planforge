/**
 * planforge plan <goal> - generate .cursor/plans/<summary>-<hash>.plan.md via configured planner provider
 */

import fs from "fs-extra";
import { resolve } from "path";
import { randomBytes } from "crypto";
import { getProjectRoot, getPlansDir } from "../utils/paths.js";
import { loadConfig } from "../config/load.js";
import { getPlannerRunner } from "../providers/registry.js";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .slice(0, 40) || "plan";
}

function shortHash(): string {
  return randomBytes(4).toString("hex");
}

export async function runPlan(args: string[]): Promise<void> {
  const goal = args.join(" ").trim();
  if (!goal) {
    console.error("Usage: planforge plan <goal>");
    process.exit(1);
  }

  const cwd = process.cwd();
  const projectRoot = getProjectRoot(cwd);

  const config = await loadConfig(projectRoot);
  const runner = getPlannerRunner(config.planner.provider);

  if (!runner) {
    console.error(`Unknown planner provider: ${config.planner.provider}. Check planforge.json.`);
    process.exit(1);
  }

  if (!runner.check()) {
    console.error(`${config.planner.provider} CLI not found. Install the provider CLI to use planforge plan.`);
    process.exit(1);
  }

  try {
    const planBody = await runner.runPlan(goal, { cwd: projectRoot });
    const slug = slugify(goal);
    const hash = shortHash();
    const plansDir = getPlansDir(projectRoot);
    await fs.ensureDir(plansDir);
    const filename = `${slug}-${hash}.plan.md`;
    const filePath = resolve(plansDir, filename);
    await fs.writeFile(filePath, planBody, "utf-8");
    console.log("Created:", filePath);
  } catch (err) {
    console.error("Plan generation failed:", (err as Error).message);
    process.exit(1);
  }
}
