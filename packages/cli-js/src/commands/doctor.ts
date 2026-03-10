/**
 * planforge doctor - check environment and providers
 */

import fs from "fs-extra";
import { resolve } from "path";
import { getProjectRoot, getPlansDir } from "../utils/paths.js";
import { loadConfig } from "../config/load.js";
import type { PlanForgeConfig } from "../config/presets.js";
import { checkClaude } from "../providers/claude.js";
import { checkCodex } from "../providers/codex.js";
import { getPreferredInstructionFile } from "../utils/project-context.js";

type Status = "ok" | "warn" | "error";

interface Check {
  name: string;
  status: Status;
  message: string;
}

function statusSymbol(s: Status): string {
  switch (s) {
    case "ok":
      return "[OK]";
    case "warn":
      return "[WARN]";
    case "error":
      return "[ERROR]";
  }
}

function providerRoles(config: PlanForgeConfig | null, provider: string): string[] {
  const roles: string[] = [];
  if (config?.planner.provider === provider) roles.push("planner");
  if (config?.implementer.provider === provider) roles.push("implementer");
  return roles;
}

export async function runDoctor(_args: string[]): Promise<void> {
  const cwd = process.cwd();
  const projectRoot = getProjectRoot(cwd);
  const plansDir = getPlansDir(projectRoot);
  const checks: Check[] = [];

  const configPath = resolve(projectRoot, "planforge.json");
  const hasConfigFile = await fs.pathExists(configPath);
  let config: PlanForgeConfig | null = null;
  let configLoadError: Error | null = null;
  if (hasConfigFile) {
    try {
      config = await loadConfig(projectRoot);
    } catch (e) {
      configLoadError = e instanceof Error ? e : new Error(String(e));
    }
  }

  const hasClaude = checkClaude();
  const hasCodex = checkCodex();

  checks.push({
    name: "Claude CLI",
    status: hasClaude ? "ok" : "warn",
    message: hasClaude ? "available" : "not found (planning /p will be limited)",
  });
  checks.push({
    name: "Codex CLI",
    status: hasCodex ? "ok" : "warn",
    message: hasCodex ? "available" : "not found (implementation /i will be limited)",
  });

  const claudeMdPath = resolve(projectRoot, "CLAUDE.md");
  const hasClaudeMd = await fs.pathExists(claudeMdPath);
  const hasAgentsMd = await fs.pathExists(resolve(projectRoot, "AGENTS.md"));
  const claudeRoles = providerRoles(config, "claude");
  checks.push({
    name: "CLAUDE.md",
    status: hasClaudeMd ? "ok" : (claudeRoles.length > 0 || hasClaude ? "warn" : "ok"),
    message: hasClaudeMd
      ? (claudeRoles.length > 0 ? `exists (used by ${claudeRoles.join(" + ")})` : "exists")
      : (claudeRoles.length > 0
        ? (hasAgentsMd
          ? `missing (configured Claude role will fall back to AGENTS.md; preferred: ${getPreferredInstructionFile("claude")})`
          : "missing (run claude /init or planforge init)")
        : (hasClaude ? "missing (run claude /init if you want Claude-specific project instructions)" : "optional")),
  });

  const codexRoles = providerRoles(config, "codex");
  checks.push({
    name: "AGENTS.md",
    status: hasAgentsMd ? "ok" : (codexRoles.length > 0 || hasCodex ? "warn" : "ok"),
    message: hasAgentsMd
      ? (codexRoles.length > 0 ? `exists (used by ${codexRoles.join(" + ")})` : "exists")
      : (codexRoles.length > 0
        ? (hasClaudeMd
          ? `missing (configured Codex role will fall back to CLAUDE.md; preferred: ${getPreferredInstructionFile("codex")})`
          : "missing (run planforge init)")
        : (hasCodex ? "missing (run planforge init if you want Codex-specific project instructions)" : "optional")),
  });

  if (!hasConfigFile) {
    checks.push({
      name: "planforge.json",
      status: "error",
      message: "missing (run planforge init)",
    });
  } else if (configLoadError) {
    checks.push({
      name: "planforge.json",
      status: "error",
      message: `invalid or unreadable (${configLoadError.message})`,
    });
  } else {
    checks.push({
      name: "planforge.json",
      status: "ok",
      message: "exists",
    });
  }

  const hasPlansDir = await fs.pathExists(plansDir);
  checks.push({
    name: ".cursor/plans",
    status: hasPlansDir ? "ok" : "error",
    message: hasPlansDir ? "exists" : "missing (run planforge init)",
  });

  const contextDir = config?.contextDir ?? ".cursor/context";
  const contextDirPath = resolve(projectRoot, contextDir);
  const hasContextDir = await fs.pathExists(contextDirPath);
  checks.push({
    name: "contextDir",
    status: hasContextDir ? "ok" : "warn",
    message: hasContextDir ? `${contextDir} exists` : `${contextDir} missing (run planforge init)`,
  });

  console.log("\nPlanForge doctor");
  console.log("  ------------------------------");
  console.log("");
  const maxName = Math.max(...checks.map((c) => c.name.length), 16);
  for (const c of checks) {
    const sym = statusSymbol(c.status);
    const padded = c.name.padEnd(maxName);
    console.log(`  ${sym}  ${padded}  ${c.message}`);
  }
  console.log("");
  if (!hasClaude || !hasCodex) {
    console.log("  Run planforge init to install missing providers.");
  }
  if (claudeRoles.length > 0 || codexRoles.length > 0) {
    console.log("  Provider roles prefer CLAUDE.md for Claude and AGENTS.md for Codex, with fallback to the other file.");
  }
  if (hasClaude || hasCodex) {
    console.log("  Run planforge config suggest to see recommended config for your providers.");
  }
  console.log("");

  const hasError = checks.some((c) => c.status === "error");
  if (hasError) {
    process.exit(1);
  }
}
