/**
 * Shell / process utilities (run claude, codex, etc.)
 */

import { execSync } from "child_process";

const isWindows = process.platform === "win32";

export function runCommand(cmd: string, args: string[], cwd?: string): string {
  const full = [cmd, ...args].join(" ");
  return execSync(full, { encoding: "utf-8", cwd }).trim();
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
