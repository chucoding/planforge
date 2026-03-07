/**
 * planforge init - detect providers, install slash commands, create .cursor/plans
 */

import * as readline from "readline";
import { spawnSync } from "child_process";
import fs from "fs-extra";
import { resolve } from "path";
import { getProjectRoot, getPlansDir } from "../utils/paths.js";
import { checkClaude, CLIENT_NPM_PACKAGE as CLAUDE_PKG } from "../providers/claude.js";
import { checkCodex, CLIENT_NPM_PACKAGE as CODEX_PKG } from "../providers/codex.js";
import { runCommand, runCommandLive } from "../utils/shell.js";
import { installTemplates } from "../templates/install.js";
import { getPresetForProviders } from "../config/presets.js";

const DEFAULT_AGENTS_MD = `# AGENTS.md

Codex/OpenAI agent context for this project.
Customize this file to give the implementer (/i) relevant project context.
`;

const DEFAULT_CLAUDE_MD = `# CLAUDE.md

Claude project context. Run 'claude /init' after signing in, or edit this file.
`;

export type ProviderInstallChoice = "claude" | "codex" | "both" | "skip";

function ask(question: string, defaultVal: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const def = defaultVal ? ` (default: ${defaultVal})` : "";
  return new Promise((resolvePromise) => {
    rl.question(question + def + ": ", (answer) => {
      rl.close();
      resolvePromise((answer.trim() || defaultVal));
    });
  });
}

/**
 * Show provider status and prompt to install missing. Returns skip when non-TTY.
 */
export async function promptProviderInstall(
  hasClaude: boolean,
  hasCodex: boolean
): Promise<ProviderInstallChoice> {
  if (!process.stdin.isTTY) {
    return "skip";
  }

  console.log("\nPlanForge init – provider check\n");
  console.log(`  Claude CLI   ${hasClaude ? "installed" : "not found"}  (recommended for /p planning)`);
  console.log(`  Codex CLI    ${hasCodex ? "installed" : "not found"}  (recommended for /i implementation)\n`);

  if (hasClaude && hasCodex) {
    return "skip";
  }

  console.log("Install missing providers?");
  const line1 = hasClaude
    ? "  1) Claude                    (already installed)"
    : `  1) Claude                    (install ${CLAUDE_PKG})`;
  const line2 = hasCodex
    ? "  2) Codex                     (already installed)"
    : `  2) Codex                     (install ${CODEX_PKG})`;
  console.log(line1);
  console.log(line2);
  console.log("  3) Install all missing");
  console.log("  4) Skip – continue without   (use later)\n");

  const raw = await ask("Choice [1-4]", "4");
  const n = raw === "" ? 4 : parseInt(raw, 10);
  if (n === 1) return "claude";
  if (n === 2) return "codex";
  if (n === 3) return "both";
  return "skip";
}

function installProviderPackage(pkg: string): boolean {
  const ok = runCommandLive("npm", ["install", "-g", pkg]);
  if (!ok) {
    console.warn("Warning: npm install -g", pkg, "failed.");
  }
  return ok;
}

export async function runInit(args: string[]): Promise<void> {
  const skipProviderInstall = args.includes("--skip-provider-install");
  const cwd = process.cwd();
  const projectRoot = getProjectRoot(cwd);

  try {
    let hasClaude = checkClaude();
    let hasCodex = checkCodex();
    let justInstalledClaude = false;

    if (!skipProviderInstall && (!hasClaude || !hasCodex)) {
      const choice = await promptProviderInstall(hasClaude, hasCodex);
      if (choice === "claude" && !hasClaude) {
        justInstalledClaude = installProviderPackage(CLAUDE_PKG);
        hasClaude = checkClaude();
      } else if (choice === "codex" && !hasCodex) {
        installProviderPackage(CODEX_PKG);
        hasCodex = checkCodex();
      } else if (choice === "both") {
        if (!hasClaude) {
          justInstalledClaude = installProviderPackage(CLAUDE_PKG);
          hasClaude = checkClaude();
        }
        if (!hasCodex) {
          installProviderPackage(CODEX_PKG);
          hasCodex = checkCodex();
        }
      }
    }

    if (hasClaude && justInstalledClaude && process.stdin.isTTY) {
      console.log("\nClaude CLI was just installed. You'll be switched to Claude to sign in or complete setup. Exit Claude when done.\n");
      spawnSync("claude", [], { stdio: "inherit", cwd: projectRoot, shell: true });
    }

    if (hasClaude) {
      try {
        runCommand("claude", ["/init"], projectRoot);
      } catch (err) {
        console.warn("Warning: claude /init failed:", (err as Error).message);
        const claudeMdPath = resolve(projectRoot, "CLAUDE.md");
        if (!(await fs.pathExists(claudeMdPath))) {
          await fs.writeFile(claudeMdPath, DEFAULT_CLAUDE_MD, "utf-8");
          console.log("Created CLAUDE.md");
        }
        console.log("Claude /init failed (sign in may be required). Run 'claude' to sign in, then run 'claude /init' in this project.");
      }
    }

    if (hasCodex) {
      const agentsPath = resolve(projectRoot, "AGENTS.md");
      if (!(await fs.pathExists(agentsPath))) {
        await fs.writeFile(agentsPath, DEFAULT_AGENTS_MD, "utf-8");
        console.log("Created AGENTS.md");
      }
    }

    await installTemplates(projectRoot);

    const plansDir = getPlansDir(projectRoot);
    await fs.ensureDir(plansDir);
    console.log("Created .cursor/plans");

    const configPath = resolve(projectRoot, "planforge.json");
    if (!(await fs.pathExists(configPath))) {
      const preset = getPresetForProviders(hasClaude, hasCodex);
      await fs.writeJson(configPath, preset, { spaces: 2 });
      console.log("Created planforge.json");
    }

    console.log("PlanForge init complete.");
  } catch (err) {
    console.error("PlanForge init failed:", (err as Error).message);
    process.exit(1);
  }
}
