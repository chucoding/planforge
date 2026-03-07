/**
 * planforge plan <goal> - generate .cursor/plans/<summary>-<hash>.plan.md via configured planner provider
 */

import fs from "fs-extra";
import { resolve } from "path";
import { readFile } from "fs/promises";
import { randomBytes } from "crypto";
import { spawnSync } from "child_process";
import { romanize } from "@daun_jung/korean-romanizer";
import { getProjectRoot, getPlansDir } from "../utils/paths.js";
import { loadConfig } from "../config/load.js";
import { getPlannerRunner } from "../providers/registry.js";

/** Characters disallowed in filenames on Windows / macOS / Linux */
const FILENAME_UNSAFE = /[\\/:*?"<>|]/g;

function isSlugValid(slug: string): boolean {
  return slug.length > 0 && !/^-+$/.test(slug);
}

/** ASCII-only slug (a-z, 0-9, -). Used for ASCII-only mode and after romanization. */
function slugifyAscii(text: string): string {
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .slice(0, 40);
  return isSlugValid(slug) ? slug : "";
}

/** Slug that keeps Korean and Unicode; only removes filesystem-unsafe characters. */
function slugifyForFilename(text: string): string {
  const s = text
    .trim()
    .replace(FILENAME_UNSAFE, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.\s]+|[-.\s]+$/g, "")
    .slice(0, 40);
  return isSlugValid(s) ? s : "";
}

function shortHash(): string {
  return randomBytes(4).toString("hex");
}

/** Extract first # title or first non-empty line from plan markdown for use as slug source. */
function extractTitleFromPlanBody(planBody: string): string {
  const line = planBody
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return "";
  const match = line.match(/^#+\s*(.+)$/);
  return (match ? match[1].trim() : line).slice(0, 80);
}

export interface PlanCliOpts {
  contextFile?: string;
  context?: string;
}

async function resolveContext(opts: PlanCliOpts | undefined, cwd: string): Promise<string | undefined> {
  if (!opts) return undefined;
  const parts: string[] = [];
  if (opts.contextFile) {
    const absPath = resolve(cwd, opts.contextFile);
    try {
      const content = await readFile(absPath, "utf-8");
      if (content.trim()) parts.push(content.trim());
    } catch (err) {
      console.error("Failed to read context file:", (err as Error).message);
      process.exit(1);
    }
  }
  if (opts.context?.trim()) parts.push(opts.context.trim());
  if (parts.length === 0) return undefined;
  return parts.join("\n\n");
}

export async function runPlan(args: string[], opts?: PlanCliOpts): Promise<void> {
  const goal = args.join(" ").trim();
  if (!goal) {
    console.error("Usage: planforge plan <goal>");
    process.exit(1);
  }

  const cwd = process.cwd();
  const projectRoot = getProjectRoot(cwd);
  const context = await resolveContext(opts, cwd);

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
    const planBody = await runner.runPlan(goal, { cwd: projectRoot, context });
    const asciiOnly = config.planner.asciiSlug ?? process.env.PLANFORGE_ASCII_SLUG === "1";
    let slug = asciiOnly ? slugifyAscii(goal) : slugifyForFilename(goal);
    if (!isSlugValid(slug)) {
      try {
        const romanized = romanize(goal);
        slug = slugifyAscii(romanized);
      } catch {
        /* ignore romanization errors */
      }
    }
    if (!isSlugValid(slug)) {
      const title = extractTitleFromPlanBody(planBody);
      if (title) {
        slug = asciiOnly ? slugifyAscii(title) : slugifyForFilename(title);
        if (!isSlugValid(slug)) {
          try {
            slug = slugifyAscii(romanize(title));
          } catch {
            /* ignore */
          }
        }
      }
    }
    if (!isSlugValid(slug)) {
      slug = "plan";
    }
    const hash = shortHash();
    const plansDir = getPlansDir(projectRoot);
    await fs.ensureDir(plansDir);
    const filename = `${slug}-${hash}.plan.md`;
    const filePath = resolve(plansDir, filename);
    await fs.writeFile(filePath, planBody, "utf-8");
    console.log("Created:", filePath);
    // Open the plan file in Cursor for review (user can then run /i when ready)
    try {
      spawnSync("cursor", [filePath], { stdio: "ignore", windowsHide: true });
    } catch {
      /* cursor not in PATH or open failed; leave as-is */
    }
  } catch (err) {
    console.error("Plan generation failed:", (err as Error).message);
    process.exit(1);
  }
}
