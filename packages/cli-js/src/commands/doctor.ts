/**
 * planforge doctor - check environment and providers
 */

import fs from "fs-extra";
import { resolve } from "path";
import { getProjectRoot, getPlansDir } from "../utils/paths.js";
import { checkClaude } from "../providers/claude.js";
import { checkCodex } from "../providers/codex.js";

type Status = "ok" | "warn" | "error";

interface Check {
  name: string;
  status: Status;
  message: string;
}

function statusSymbol(s: Status): string {
  switch (s) {
    case "ok": return "✓";
    case "warn": return "?";
    case "error": return "✗";
  }
}

export async function runDoctor(_args: string[]): Promise<void> {
  const cwd = process.cwd();
  const projectRoot = getProjectRoot(cwd);
  const plansDir = getPlansDir(projectRoot);
  const checks: Check[] = [];

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
  checks.push({
    name: "CLAUDE.md",
    status: hasClaudeMd ? "ok" : (hasClaude ? "warn" : "ok"),
    message: hasClaudeMd ? "exists" : (hasClaude ? "missing (run claude /init)" : "n/a"),
  });

  const agentsPath = resolve(projectRoot, "AGENTS.md");
  const hasAgentsMd = await fs.pathExists(agentsPath);
  checks.push({
    name: "AGENTS.md",
    status: hasAgentsMd ? "ok" : (hasCodex ? "warn" : "ok"),
    message: hasAgentsMd ? "exists" : (hasCodex ? "missing" : "n/a"),
  });

  const configPath = resolve(projectRoot, "planforge.json");
  const hasConfig = await fs.pathExists(configPath);
  checks.push({
    name: "planforge.json",
    status: hasConfig ? "ok" : "error",
    message: hasConfig ? "exists" : "missing (run planforge init)",
  });

  const hasPlansDir = await fs.pathExists(plansDir);
  checks.push({
    name: ".cursor/plans",
    status: hasPlansDir ? "ok" : "error",
    message: hasPlansDir ? "exists" : "missing (run planforge init)",
  });

  console.log("\nPlanForge doctor\n");
  const maxName = Math.max(...checks.map((c) => c.name.length), 16);
  for (const c of checks) {
    const sym = statusSymbol(c.status);
    const padded = c.name.padEnd(maxName);
    console.log(`  ${sym}  ${padded}  ${c.message}`);
  }
  if (!hasClaude || !hasCodex) {
    console.log("  → Run planforge init to install missing providers.");
  }
  if (hasClaude || hasCodex) {
    console.log("  → Run planforge config suggest to see recommended config for your providers.");
  }
  console.log("");

  const hasError = checks.some((c) => c.status === "error");
  if (hasError) {
    process.exit(1);
  }
}
