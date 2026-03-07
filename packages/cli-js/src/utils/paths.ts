/**
 * Path resolution for PlanForge (project root, .cursor, plans dir)
 */

import { resolve } from "path";

export function getProjectRoot(cwd: string = process.cwd()): string {
  // TODO: walk up for planforge.json or .cursor
  return cwd;
}

export function getCursorDir(projectRoot: string): string {
  return resolve(projectRoot, ".cursor");
}

export function getPlansDir(projectRoot: string): string {
  return resolve(projectRoot, ".cursor", "plans");
}
