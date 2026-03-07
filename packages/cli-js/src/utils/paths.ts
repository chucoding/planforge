/**
 * Path resolution for PlanForge (project root, .cursor, plans dir)
 */

import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Find project root by walking up from cwd until we find planforge.json or .cursor.
 */
export function getProjectRoot(cwd: string = process.cwd()): string {
  let dir = resolve(cwd);
  const root = resolve(dir, "..");
  while (dir !== root) {
    if (existsSync(resolve(dir, "planforge.json")) || existsSync(resolve(dir, ".cursor"))) {
      return dir;
    }
    dir = resolve(dir, "..");
  }
  return cwd;
}

export function getCursorDir(projectRoot: string): string {
  return resolve(projectRoot, ".cursor");
}

export function getPlansDir(projectRoot: string): string {
  return resolve(projectRoot, ".cursor", "plans");
}

/**
 * Resolve path relative to CLI package (for templates).
 */
export function getTemplatesRoot(): string {
  return resolve(__dirname, "..", "..", "..", "..", "templates");
}
