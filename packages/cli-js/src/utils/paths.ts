/**
 * Path resolution for PlanForge (project root, .cursor/plans, .cursor/contexts)
 */

import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/**
 * Find project root by walking up from cwd until we find planforge.json or .cursor/plans or .cursor/contexts.
 */
export function getProjectRoot(cwd: string = process.cwd()): string {
  let dir = resolve(cwd);
  const root = resolve(dir, "..");
  while (dir !== root) {
    if (
      existsSync(resolve(dir, "planforge.json")) ||
      existsSync(resolve(dir, ".cursor", "plans")) ||
      existsSync(resolve(dir, ".cursor", "contexts"))
    ) {
      return dir;
    }
    dir = resolve(dir, "..");
  }
  return cwd;
}

export function getPlansDir(projectRoot: string): string {
  return resolve(projectRoot, ".cursor", "plans");
}

export function getContextsDir(projectRoot: string): string {
  return resolve(projectRoot, ".cursor", "contexts");
}

export function getContextDir(projectRoot: string): string {
  return getContextsDir(projectRoot);
}

export function getDefaultContextDirs(projectRoot: string): string[] {
  return [getContextsDir(projectRoot)];
}

export function getDateParts(date: Date = new Date()): { yyyyMmDd: string; mmdd: string; hhmm: string } {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return {
    yyyyMmDd: `${year}-${month}-${day}`,
    mmdd: `${month}${day}`,
    hhmm: `${hours}${minutes}`,
  };
}

export function getDatedPlansDir(projectRoot: string, date: Date = new Date()): string {
  return resolve(getPlansDir(projectRoot), getDateParts(date).yyyyMmDd);
}

/**
 * Resolve path relative to CLI package (for templates).
 */
export function getTemplatesRoot(): string {
  return resolve(__dirname, "..", "..", "..", "..", "templates");
}

/**
 * Resolve prompts directory from @planforge/core package (for planner/implementer system prompts).
 */
export function getPromptsDir(): string {
  const corePackageJson = require.resolve("@planforge/core/package.json");
  const coreRoot = dirname(corePackageJson);
  return resolve(coreRoot, "prompts");
}

/**
 * Resolve models.json path from @planforge/core package (for planforge model command).
 */
export function getModelsJsonPath(): string {
  const corePackageJson = require.resolve("@planforge/core/package.json");
  const coreRoot = dirname(corePackageJson);
  return resolve(coreRoot, "models.json");
}
