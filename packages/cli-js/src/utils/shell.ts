/**
 * Shell / process utilities (run claude, codex, etc.)
 */

import { execSync } from "child_process";

export function runCommand(cmd: string, args: string[], cwd?: string): string {
  const full = [cmd, ...args].join(" ");
  return execSync(full, { encoding: "utf-8", cwd }).trim();
}

export function hasCommand(cmd: string): boolean {
  try {
    runCommand(cmd, ["--version"]);
    return true;
  } catch {
    return false;
  }
}
