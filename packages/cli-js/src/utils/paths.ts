/**
 * Path resolution for PlanForge (project root, .planforge plans/context dirs)
 */

import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

export function getContextDir(projectRoot: string): string {
  return resolve(projectRoot, ".planforge", "context");
}

/**
 * Resolve path relative to CLI package (for templates).
 */
export function getTemplatesRoot(): string {
  return resolve(__dirname, "..", "..", "..", "..", "templates");
}
