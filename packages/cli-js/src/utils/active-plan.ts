/**
 * Resolve which plan file to use for implement: index.json activePlan or latest .plan.md by mtime.
 */

import { existsSync, statSync, readFileSync, readdirSync } from "fs";
import { resolve, join } from "path";
import { getPlansDir } from "./paths.js";

const INDEX_JSON = "index.json";

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
        const candidate = resolve(plansDir, name);
        if (existsSync(candidate)) return candidate;
        const withExt = name.endsWith(".plan.md") ? name : `${name}.plan.md`;
        const candidate2 = resolve(plansDir, withExt);
        if (existsSync(candidate2)) return candidate2;
      }
    } catch {
      /* ignore invalid index.json */
    }
  }

  let latestPath: string | null = null;
  let latestMtime = 0;
  try {
    const entries = readdirSync(plansDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(".plan.md")) continue;
      const full = join(plansDir, e.name);
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
