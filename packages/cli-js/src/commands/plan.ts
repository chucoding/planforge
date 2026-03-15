/**
 * planforge plan <goal> - generate dated .plan.md files via configured planner provider
 */

import fs from "fs-extra";
import readline from "readline";
import { relative, resolve } from "path";
import { spawnSync } from "child_process";
import { romanize } from "@daun_jung/korean-romanizer";
import { getProjectRoot, getPlansDir, getDatedPlansDir, getDateParts } from "../utils/paths.js";
import { getRepoContext } from "../utils/repo-context.js";
import { getProjectContext } from "../utils/project-context.js";
import { loadMergedContext } from "../utils/context.js";
import { fetchUrlsContext } from "../utils/url-fetch.js";
import { loadConfig } from "../config/load.js";
import { resolvePlannerStreamTimeoutSec } from "../config/timeout.js";
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

/** Pattern for "Filename slug: <slug>" at end of plan. Slug: 1–3 segments, lowercase alphanumeric + hyphens, max 2 hyphens. */
const FILENAME_SLUG_RE = /Filename slug:\s*([a-z0-9]+(?:-[a-z0-9]+){0,2})\s*$/im;

/** Parse slug from plan body if present and valid (ASCII, max 2 hyphens). Returns null if missing or invalid. */
function parseSlugFromPlanBody(planBody: string): string | null {
  const m = planBody.match(FILENAME_SLUG_RE);
  if (!m) return null;
  const slug = m[1].trim().toLowerCase();
  if (!slug || (slug.match(/-/g)?.length ?? 0) > 2) return null;
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  return isSlugValid(slug) ? slug : null;
}

/** Remove the "Filename slug: ..." line from plan body so it is not shown in the saved file. */
function stripFilenameSlugLine(planBody: string): string {
  const lines = planBody.split(/\r?\n/);
  const filtered = lines.filter((line) => !/^\s*Filename slug:\s*.+$/i.test(line.trim()));
  return filtered.join("\n").trimEnd();
}

/** Limit slug to at most 2 hyphens by taking first 3 segments. */
function limitSlugHyphens(slug: string): string {
  const parts = slug.split("-");
  if (parts.length <= 3) return slug;
  return parts.slice(0, 3).join("-");
}

export interface PlanCliOpts {
  contextDir?: string;
  context?: string;
  /** When set, use this slug for the plan output filename (HHMM-<slug>.plan.md). Validated and hyphen-limited. */
  slug?: string;
}

export async function runPlan(args: string[], opts?: PlanCliOpts): Promise<void> {
  const goal = args.join(" ").trim();
  if (!goal) {
    console.error("Usage: planforge plan <goal> [--slug <slug>]");
    process.exit(1);
  }

  const cwd = process.cwd();
  const projectRoot = getProjectRoot(cwd);
  const config = await loadConfig(projectRoot);
  let context: string | undefined;
  try {
    context = await loadMergedContext(projectRoot, {
      contextDir: opts?.contextDir,
      inlineContext: opts?.context,
    });
  } catch (err) {
    console.error("Failed to load context:", (err as Error).message);
    process.exit(1);
  }
  const urlContext = await fetchUrlsContext(goal);
  if (urlContext) context = urlContext + "\n\n" + (context ?? "");
  const runner = getPlannerRunner(config.planner.provider);

  if (!runner) {
    console.error(`Unknown planner provider: ${config.planner.provider}. Check planforge.json.`);
    process.exit(1);
  }

  if (!runner.check()) {
    console.error(`${config.planner.provider} CLI not found. Install the provider CLI to use planforge plan.`);
    process.exit(1);
  }

  const repoContext = getRepoContext(projectRoot, goal);
  const { content: projectContext, source: projectContextSource } = getProjectContext(
    projectRoot,
    config.planner.provider
  );

  const streamTimeoutSec = resolvePlannerStreamTimeoutSec(config.planner);
  const dim = "\x1b[2m";
  const reset = "\x1b[0m";
  const spinnerFrames = ["|", "/", "-", "\\"];
  let spinnerInterval: ReturnType<typeof setInterval> | null = null;
  const startSpinner = () => {
    let frameIdx = 0;
    spinnerInterval = setInterval(() => {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(`${dim}Loading...${reset} ${spinnerFrames[frameIdx % spinnerFrames.length]}`);
      frameIdx++;
    }, 80);
  };
  const stopSpinner = () => {
    if (spinnerInterval !== null) {
      clearInterval(spinnerInterval);
      spinnerInterval = null;
    }
    if (process.stdout.isTTY) {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
    }
  };
  if (process.stdout.isTTY) {
    startSpinner();
  }
  try {
    const planBody = await runner.runPlan(goal, {
      cwd: projectRoot,
      context,
      repoContext,
      projectContext,
      projectContextSource,
      streamTimeoutMs: streamTimeoutSec === 0 ? 0 : streamTimeoutSec * 1000,
      onFirstChunk: process.stdout.isTTY ? stopSpinner : undefined,
    });
    const bodyToWrite = stripFilenameSlugLine(planBody);
    let slug: string;
    if (opts?.slug?.trim()) {
      const raw = opts.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
      slug = isSlugValid(raw) ? limitSlugHyphens(raw) : "plan";
    } else {
      slug = parseSlugFromPlanBody(planBody) ?? "";
      if (!slug) {
        slug = slugifyAscii(goal);
        if (!isSlugValid(slug)) {
          try {
            slug = slugifyAscii(romanize(goal));
          } catch {
            /* ignore romanization errors */
          }
        }
        if (!isSlugValid(slug)) {
          const title = extractTitleFromPlanBody(planBody);
          if (title) {
            slug = slugifyAscii(title);
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
        slug = limitSlugHyphens(slug);
      }
    }
    const now = new Date();
    const plansDir = getPlansDir(projectRoot);
    const datedPlansDir = getDatedPlansDir(projectRoot, now);
    await fs.ensureDir(datedPlansDir);
    const filename = `${getDateParts(now).hhmm}-${slug}.plan.md`;
    const filePath = resolve(datedPlansDir, filename);
    await fs.writeFile(filePath, bodyToWrite, "utf-8");
    await fs.writeJson(
      resolve(plansDir, "index.json"),
      { activePlan: relative(plansDir, filePath).replace(/\\/g, "/") },
      { spaces: 2 }
    );
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
  } finally {
    stopSpinner();
  }
}
