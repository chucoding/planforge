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
import { getPresetForProviders, type PlanForgeConfig } from "../config/presets.js";

const DEFAULT_AGENTS_MD = `# AGENTS.md

Codex/OpenAI agent context for this project.
Customize this file to give the implementer (/i) relevant project context.
`;

const DEFAULT_CLAUDE_MD = `# CLAUDE.md

Claude project context. Run 'claude /init' after signing in, or edit this file.
`;

/** First-step choice: which provider to install (one at a time), or none. */
export type FirstProviderChoice = "claude" | "codex" | "no";

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
 * First prompt: install one missing provider or no. Returns "no" when non-TTY.
 */
async function promptFirstProvider(
  hasClaude: boolean,
  hasCodex: boolean
): Promise<FirstProviderChoice> {
  if (!process.stdin.isTTY) {
    return "no";
  }

  console.log("\nPlanForge init – provider check\n");
  console.log(`  Claude CLI   ${hasClaude ? "installed" : "not found"}  (recommended for /p planning)`);
  console.log(`  Codex CLI    ${hasCodex ? "installed" : "not found"}  (recommended for /i implementation)`);
  console.log("");

  if (hasClaude && !hasCodex) {
    console.log("Install Codex?");
    console.log("  (1) Yes   (2) No");
    const raw = await ask("Choice", "2");
    const n = raw === "" ? 2 : parseInt(raw, 10);
    return n === 1 ? "codex" : "no";
  }
  if (!hasClaude && hasCodex) {
    console.log("Install Claude?");
    console.log("  (1) Yes   (2) No");
    const raw = await ask("Choice", "2");
    const n = raw === "" ? 2 : parseInt(raw, 10);
    return n === 1 ? "claude" : "no";
  }
  if (!hasClaude && !hasCodex) {
    console.log("Which one to install first?");
    console.log(`  1) Claude  (install ${CLAUDE_PKG})`);
    console.log(`  2) Codex   (install ${CODEX_PKG})`);
    console.log("");
    const raw = await ask("Choice [1-2]", "1");
    const n = raw === "" ? 1 : parseInt(raw, 10);
    return n === 2 ? "codex" : "claude";
  }
  return "no";
}

function installProviderPackage(pkg: string): boolean {
  const ok = runCommandLive("npm", ["install", "-g", pkg]);
  if (!ok) {
    console.warn("Warning: npm install -g", pkg, "failed.");
  }
  return ok;
}

/** Load config from planforge.json or preset for current providers. */
async function getConfigForBox(
  projectRoot: string,
  hasClaude: boolean,
  hasCodex: boolean
): Promise<PlanForgeConfig> {
  const configPath = resolve(projectRoot, "planforge.json");
  if (await fs.pathExists(configPath)) {
    return (await fs.readJson(configPath)) as PlanForgeConfig;
  }
  return getPresetForProviders(hasClaude, hasCodex);
}

function formatRoleModel(config: PlanForgeConfig, role: "planner" | "implementer"): string {
  const r = config[role];
  return `${r.provider} / ${r.model}`;
}

/** Draw Complete UI box with title and /p, /i model lines. */
async function showCompleteBox(
  projectRoot: string,
  hasClaude: boolean,
  hasCodex: boolean,
  title: string
): Promise<void> {
  const config = await getConfigForBox(projectRoot, hasClaude, hasCodex);
  const pLine = `  /p (planning)     : ${formatRoleModel(config, "planner")}`;
  const iLine = `  /i (implementation): ${formatRoleModel(config, "implementer")}`;
  const lines = [title, pLine, iLine];
  const width = Math.max(...lines.map((s) => s.length), 40);
  const top = "┌" + "─".repeat(width + 2) + "┐";
  const bottom = "└" + "─".repeat(width + 2) + "┘";
  console.log("");
  console.log(top);
  for (const line of lines) {
    console.log("│ " + line.padEnd(width) + " │");
  }
  console.log(bottom);
  console.log("");
}

/** After box: install the other provider or finish. Returns true if we should set finishedWithCodexOnly and show guide. */
async function promptInstallOtherAfterBox(
  hasClaude: boolean,
  hasCodex: boolean
): Promise<"install_other" | "finish"> {
  if (!process.stdin.isTTY || (hasClaude && hasCodex)) {
    return "finish";
  }
  const other = !hasClaude ? "Claude" : "Codex";
  console.log(`Install ${other} too?`);
  console.log("  (1) Yes   (2) No, finish");
  console.log("");
  const raw = await ask("Choice [1-2]", "2");
  const n = raw === "" ? 2 : parseInt(raw, 10);
  return n === 1 ? "install_other" : "finish";
}

export async function runInit(args: string[]): Promise<void> {
  const skipProviderInstall = args.includes("--skip-provider-install");
  const cwd = process.cwd();
  const projectRoot = getProjectRoot(cwd);

  try {
    let hasClaude = checkClaude();
    let hasCodex = checkCodex();
    let justInstalledClaude = false;
    let installedClaudeThisRun = false;
    let installedCodexThisRun = false;
    let finishedWithCodexOnly = false;

    if (!skipProviderInstall && (!hasClaude || !hasCodex)) {
      const first = await promptFirstProvider(hasClaude, hasCodex);
      if (first !== "no") {
        if (first === "claude" && !hasClaude) {
          justInstalledClaude = installProviderPackage(CLAUDE_PKG);
          hasClaude = checkClaude();
          installedClaudeThisRun = true;
        } else if (first === "codex" && !hasCodex) {
          installProviderPackage(CODEX_PKG);
          hasCodex = checkCodex();
          installedCodexThisRun = true;
        }
      }
    }

    if (hasCodex && installedCodexThisRun && process.stdin.isTTY) {
      console.log("\nCodex CLI was just installed. You'll be switched to Codex to sign in. Exit with Ctrl+C when done.\n");
      spawnSync("codex", [], { stdio: "inherit", cwd: projectRoot, shell: true });
    }
    if (hasClaude && justInstalledClaude && process.stdin.isTTY) {
      console.log("\nClaude CLI was just installed. You'll be switched to Claude to sign in or complete setup. Exit Claude when done.\n");
      spawnSync("claude", [], { stdio: "inherit", cwd: projectRoot, shell: true });
    }

    if (installedCodexThisRun || installedClaudeThisRun) {
      const boxTitle =
        hasClaude && hasCodex
          ? "Both providers are ready."
          : hasCodex
            ? "Complete. Codex is ready."
            : "Complete. Claude is ready.";
      await showCompleteBox(projectRoot, hasClaude, hasCodex, boxTitle);

      const nextAfterBox = await promptInstallOtherAfterBox(hasClaude, hasCodex);
      if (nextAfterBox === "finish") {
        if (hasCodex && !hasClaude) {
          finishedWithCodexOnly = true;
        }
        const otherWasMissing = !hasClaude || !hasCodex;
        if (otherWasMissing) {
          console.log("In Cursor, use /p for planning and /i for implementation. Try it out!");
          console.log("");
        }
      } else {
        if (!hasClaude) {
          justInstalledClaude = installProviderPackage(CLAUDE_PKG);
          hasClaude = checkClaude();
          installedClaudeThisRun = true;
          if (hasClaude && process.stdin.isTTY) {
            console.log("\nSwitching to Claude to sign in. Exit when done.\n");
            spawnSync("claude", [], { stdio: "inherit", cwd: projectRoot, shell: true });
          }
        } else if (!hasCodex) {
          installProviderPackage(CODEX_PKG);
          hasCodex = checkCodex();
          installedCodexThisRun = true;
          if (hasCodex && process.stdin.isTTY) {
            console.log("\nSwitching to Codex to sign in. Exit with Ctrl+C when done.\n");
            spawnSync("codex", [], { stdio: "inherit", cwd: projectRoot, shell: true });
          }
        }
        if (hasClaude && hasCodex) {
          await showCompleteBox(projectRoot, hasClaude, hasCodex, "Both providers are ready.");
        }
      }
    }

    if (hasClaude && !finishedWithCodexOnly) {
      try {
        runCommand("claude", ["/init"], projectRoot);
      } catch (err) {
        console.warn("Warning: claude /init failed:", (err as Error).message);
        const claudeMdPath = resolve(projectRoot, "CLAUDE.md");
        if (!(await fs.pathExists(claudeMdPath))) {
          await fs.writeFile(claudeMdPath, DEFAULT_CLAUDE_MD, "utf-8");
          console.log("  Created CLAUDE.md");
        }
        console.log("  Claude /init failed (sign in may be required). Run 'claude' to sign in, then run 'claude /init' in this project.");
      }
    }

    if (hasCodex) {
      const agentsPath = resolve(projectRoot, "AGENTS.md");
      if (!(await fs.pathExists(agentsPath))) {
        await fs.writeFile(agentsPath, DEFAULT_AGENTS_MD, "utf-8");
        console.log("  Created AGENTS.md");
      }
    }

    await installTemplates(projectRoot);

    const plansDir = getPlansDir(projectRoot);
    await fs.ensureDir(plansDir);
    console.log("");
    console.log("  Created .cursor/plans");

    const configPath = resolve(projectRoot, "planforge.json");
    if (!(await fs.pathExists(configPath))) {
      const preset = getPresetForProviders(hasClaude, hasCodex);
      await fs.writeJson(configPath, preset, { spaces: 2 });
      console.log("  Created planforge.json");
    }

    console.log("");
    console.log("PlanForge init complete.");
  } catch (err) {
    console.error("PlanForge init failed:", (err as Error).message);
    process.exit(1);
  }
}
