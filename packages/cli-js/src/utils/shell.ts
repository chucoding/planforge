/**
 * Shell / process utilities (run claude, codex, etc.)
 */

import { execSync, spawnSync } from "child_process";

const isWindows = process.platform === "win32";

export function runCommand(cmd: string, args: string[], cwd?: string): string {
  const full = [cmd, ...args].join(" ");
  return execSync(full, { encoding: "utf-8", cwd }).trim();
}

/**
 * Run a command with stdio inherited so output is visible in the terminal. Returns true if exit code is 0.
 */
export function runCommandLive(cmd: string, args: string[], cwd?: string): boolean {
  const result = spawnSync(cmd, args, { stdio: "inherit", cwd, shell: true });
  return result.status === 0;
}

export function hasCommand(cmd: string): boolean {
  try {
    const check = isWindows ? `where ${cmd}` : `which ${cmd}`;
    execSync(check, { encoding: "utf-8", stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve full path to command executable (for spawning without shell so arguments are preserved).
 */
export function resolveCommandPath(cmd: string): string | null {
  try {
    const check = isWindows ? `where ${cmd}` : `which ${cmd}`;
    const out = execSync(check, { encoding: "utf-8", stdio: "pipe" });
    const first = out.split(/[\r\n]+/)[0]?.trim();
    return first || null;
  } catch {
    return null;
  }
}
