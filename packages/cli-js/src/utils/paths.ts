/**
 * Path resolution for PlanForge (project root, .planforge plans/contexts dirs)
 */

import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/**
 * Find project root by walking up from cwd until we find planforge.json or .planforge.
 */
export function getProjectRoot(cwd: string = process.cwd()): string {
  let dir = resolve(cwd);
  const root = resolve(dir, "..");
  while (dir !== root) {
    if (existsSync(resolve(dir, "planforge.json")) || existsSync(resolve(dir, ".planforge"))) {
      return dir;
    }
    dir = resolve(dir, "..");
  }
  return cwd;
}

export function getPlansDir(projectRoot: string): string {
  return resolve(projectRoot, ".planforge", "plans");
}

export function getContextsDir(projectRoot: string): string {
  return resolve(projectRoot, ".planforge", "contexts");
}

/** Legacy path; used by doctor for migration warning only. TODO: 06-13에 제거 */
export function getLegacyContextDir(projectRoot: string): string {
  return resolve(projectRoot, ".planforge", "context");
}

export function getContextDir(projectRoot: string): string {
  return getContextsDir(projectRoot);
}

export function getDefaultContextDirs(projectRoot: string): string[] {
  return [getContextsDir(projectRoot)];
}

export function getDateParts(date: Date = new Date()): { yyyyMmDd: string; mmdd: string } {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return {
    yyyyMmDd: `${year}-${month}-${day}`,
    mmdd: `${month}${day}`,
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
