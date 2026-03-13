/**
 * Resolve which plan file to use for implement: index.json activePlan or latest .plan.md by mtime.
 */

import { existsSync, statSync, readFileSync, readdirSync } from "fs";
import { resolve, join } from "path";
import { getPlansDir } from "./paths.js";

const INDEX_JSON = "index.json";

function collectPlanFiles(plansDir: string): string[] {
  const out: string[] = [];
  const stack = [plansDir];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith(".plan.md")) {
        out.push(full);
      }
    }
  }
  return out;
}

function resolveActivePlanCandidate(plansDir: string, name: string): string | null {
  const normalized = name.replace(/\\/g, "/");
  const directCandidates = [
    resolve(plansDir, normalized),
    resolve(plansDir, normalized.endsWith(".plan.md") ? normalized : `${normalized}.plan.md`),
  ];
  for (const candidate of directCandidates) {
    if (existsSync(candidate)) return candidate;
  }

  const targetBasenames = new Set(directCandidates.map((candidate) => candidate.split(/[/\\]/).pop() ?? ""));
  for (const path of collectPlanFiles(plansDir)) {
    const basename = path.split(/[/\\]/).pop() ?? "";
    if (targetBasenames.has(basename)) return path;
  }
  return null;
}

export function getActivePlanPath(projectRoot: string): string | null {
  const plansDir = getPlansDir(projectRoot);
  if (!existsSync(plansDir)) return null;

  const indexPath = join(plansDir, INDEX_JSON);
  if (existsSync(indexPath)) {
    try {
      const raw = readFileSync(indexPath, "utf-8");
      const data = JSON.parse(raw) as { activePlan?: string };
      const name = data.activePlan?.trim();
      if (name) {
        const candidate = resolveActivePlanCandidate(plansDir, name);
        if (candidate) return candidate;
      }
    } catch {
      /* ignore invalid index.json */
    }
  }

  let latestPath: string | null = null;
  let latestMtime = 0;
  try {
    for (const full of collectPlanFiles(plansDir)) {
      const mtime = statSync(full).mtimeMs;
      if (mtime > latestMtime) {
        latestMtime = mtime;
        latestPath = full;
      }
    }
  } catch {
    return null;
  }
  return latestPath;
}
