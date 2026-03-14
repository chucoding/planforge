/**
 * Shell / process utilities (run claude, codex, etc.)
 */

import { execSync, spawnSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

const isWindows = process.platform === "win32";

/**
 * Common npm global install locations (for sandboxed environments where PATH may be restricted).
 * Used by resolveCommandPathWithNpmFallback.
 */
export function getNpmGlobalExeCandidates(cmd: string): string[] {
  if (isWindows) {
    const appData = process.env.APPDATA;
    const localAppData = process.env.LOCALAPPDATA;
    const candidates = [
      appData && join(appData, "npm", `${cmd}.cmd`),
      appData && join(appData, "npm", cmd),
      localAppData && join(localAppData, "npm", `${cmd}.cmd`),
      localAppData && join(localAppData, "npm", cmd),
    ].filter((p): p is string => Boolean(p));
    return candidates;
  }
  const home = process.env.HOME;
  if (!home) return [];
  return [
    join(home, ".npm-global", "bin", cmd),
    join(home, ".local", "bin", cmd),
    join(home, "npm", "bin", cmd),
    "/usr/local/bin/" + cmd,
  ];
}

/**
 * Resolve full path to command: try PATH first, then common npm global locations.
 * Works in sandboxed environments (e.g. Cursor agent) where PATH may not include npm global bin.
 */
export function resolveCommandPathWithNpmFallback(cmd: string): string | null {
  const fromPath = resolveCommandPath(cmd);
  if (fromPath) return fromPath;
  const candidate = getNpmGlobalExeCandidates(cmd).find((p) => existsSync(p));
  return candidate ?? null;
}

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
 * On Windows, prefers .cmd so we get the real npm global wrapper (e.g. codex.cmd) not the extensionless entry.
 */
export function resolveCommandPath(cmd: string): string | null {
  try {
    const check = isWindows ? `where ${cmd}` : `which ${cmd}`;
    const out = execSync(check, { encoding: "utf-8", stdio: "pipe" });
    const lines = out.split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean);
    if (isWindows && lines.length > 0) {
      const preferred = lines.find((p) => p.toLowerCase().endsWith(".cmd"));
      const chosen = preferred ?? lines.find((p) => existsSync(p)) ?? lines[0];
      return chosen || null;
    }
    return lines[0] || null;
  } catch {
    return null;
  }
}
