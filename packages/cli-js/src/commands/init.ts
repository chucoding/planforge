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
import { getDefaultConfig } from "../config/load.js";
import type { PlanForgeConfig } from "../config/types.js";
import { formatRole, configEqual } from "./config.js";

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

  console.log("\nPlanForge init - provider check\n");
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

function formatRoleModel(config: PlanForgeConfig, role: "planner" | "implementer"): string {
  const r = config[role];
  let s = `${r.provider} / ${r.model}`;
  if (r.reasoning) s += ` (reasoning: ${r.reasoning})`;
  if (r.effort) s += ` (effort: ${r.effort})`;
  return s;
}

/** Draw Complete UI box with title and /p, /i model lines. Uses default config for current providers so the box reflects recommended config. */
function showCompleteBox(
  hasClaude: boolean,
  hasCodex: boolean,
  title: string
): void {
  const config = getDefaultConfig(hasClaude, hasCodex);
  const pLine = `  /p (planning)     : ${formatRoleModel(config, "planner")}`;
  const iLine = `  /i (implementation): ${formatRoleModel(config, "implementer")}`;
  const lines = [title, pLine, iLine];
  const width = Math.max(...lines.map((s) => s.length), 40);
  const top = "+" + "-".repeat(width + 2) + "+";
  const bottom = "+" + "-".repeat(width + 2) + "+";
  console.log("");
  console.log(top);
  for (const line of lines) {
    console.log("| " + line.padEnd(width) + " |");
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
    let showGuideAtEnd = false;

    if (!skipProviderInstall) {
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
      showCompleteBox(hasClaude, hasCodex, boxTitle);

      const nextAfterBox = await promptInstallOtherAfterBox(hasClaude, hasCodex);
      if (nextAfterBox === "finish") {
        if (hasCodex && !hasClaude) {
          finishedWithCodexOnly = true;
        }
        if (!hasClaude || !hasCodex) {
          showGuideAtEnd = true;
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
          showCompleteBox(hasClaude, hasCodex, "Both providers are ready.");
        }
      }
    }

    if (hasClaude && !finishedWithCodexOnly) {
      try {
        runCommand("claude", ["/init"], projectRoot);
      } catch (err) {
        console.warn("Warning: claude /init failed:", (err as Error).message);
        console.log("  Run 'claude' to sign in.");
      }
    }

    await installTemplates(projectRoot);

    const plansDir = getPlansDir(projectRoot);
    await fs.ensureDir(plansDir);
    await fs.ensureDir(resolve(projectRoot, ".cursor", "context"));

    const configPath = resolve(projectRoot, "planforge.json");
    const configExists = await fs.pathExists(configPath);
    let createdConfig = false;
    let updatedConfig = false;
    if (!configExists) {
      const defaultConfig = getDefaultConfig(hasClaude, hasCodex);
      await fs.writeJson(configPath, defaultConfig, { spaces: 2 });
      createdConfig = true;
    } else {
      const current = (await fs.readJson(configPath)) as PlanForgeConfig;
      const suggested = getDefaultConfig(hasClaude, hasCodex);
      if (!configEqual(current, suggested) && process.stdin.isTTY) {
        console.log("");
        console.log("  planforge.json already exists. Current config differs from suggested for your installed providers.");
        console.log("");
        console.log("  Current:   planner     " + formatRole(current, "planner"));
        console.log("             implementer " + formatRole(current, "implementer"));
        console.log("");
        console.log("  Suggested: planner     " + formatRole(suggested, "planner"));
        console.log("             implementer " + formatRole(suggested, "implementer"));
        console.log("");
        const raw = await ask("Update planforge.json to suggested? (1) Yes (2) No, keep current", "2");
        const n = raw === "" ? 2 : parseInt(raw, 10);
        if (n === 1) {
          await fs.writeJson(configPath, suggested, { spaces: 2 });
          updatedConfig = true;
        }
      }
    }

    console.log("");
    if (showGuideAtEnd) {
      console.log("  Congratulations! PlanForge is ready.");
      console.log("");
      console.log("  Example: Design a simple tetris game.");
      console.log("  In Cursor, use /p for planning and /i for implementation. Try it out!");
      console.log("");
    }
    console.log("  Created .cursor/plans");
    console.log("  Created .cursor/context");
    if (createdConfig) {
      console.log("  Created planforge.json");
    } else if (updatedConfig) {
      console.log("  Updated planforge.json to suggested config.");
    }
    console.log("");
    console.log("PlanForge init complete.");
  } catch (err) {
    console.error("PlanForge init failed:", (err as Error).message);
    process.exit(1);
  }
}

