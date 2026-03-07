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

/** First-step choice: which provider to install (one at a time), or none. */
export type FirstProviderChoice = "claude" | "codex" | "no";

/** After Complete UI: install the other provider, finish, or finish and skip Claude init. */
export type AfterCompleteChoice = "install_other" | "finish" | "finish_skip_claude";

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

/**
 * After Complete UI: install the other provider or finish. When both installed and we just added Codex (had Claude), offer to skip Claude setup.
 */
async function promptAfterComplete(
  hasClaude: boolean,
  hasCodex: boolean,
  justInstalledCodexAndHadClaude: boolean
): Promise<AfterCompleteChoice> {
  if (!process.stdin.isTTY) {
    return "finish";
  }
  if (hasClaude && hasCodex) {
    if (justInstalledCodexAndHadClaude) {
      console.log("Both providers are ready. Continuing with init.\n");
      return "finish_skip_claude";
    }
    console.log("Both providers are ready. Continuing with init.\n");
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
    const hasClaudeAtStart = hasClaude;
    let justInstalledClaude = false;
    let installedClaudeThisRun = false;
    let installedCodexThisRun = false;
    let finishedWithCodexOnly = false;

    if (!skipProviderInstall && (!hasClaude || !hasCodex)) {
      for (;;) {
        const first = await promptFirstProvider(hasClaude, hasCodex);
        if (first === "no") {
          break;
        }
        if (first === "claude" && !hasClaude) {
          justInstalledClaude = installProviderPackage(CLAUDE_PKG);
          hasClaude = checkClaude();
          installedClaudeThisRun = true;
          console.log("\nComplete. Claude is ready.\n");
        } else if (first === "codex" && !hasCodex) {
          installProviderPackage(CODEX_PKG);
          hasCodex = checkCodex();
          installedCodexThisRun = true;
          console.log("\nComplete. Codex is ready.\n");
        }

        const justInstalledCodexAndHadClaude =
          hasClaudeAtStart && installedCodexThisRun && !installedClaudeThisRun;
        const next = await promptAfterComplete(
          hasClaude,
          hasCodex,
          justInstalledCodexAndHadClaude
        );
        if (next === "finish" || next === "finish_skip_claude") {
          if (next === "finish_skip_claude") {
            finishedWithCodexOnly = true;
          }
          break;
        }
        if (next === "install_other" && !hasClaude) {
          justInstalledClaude = installProviderPackage(CLAUDE_PKG);
          hasClaude = checkClaude();
          installedClaudeThisRun = true;
          console.log("\nComplete. Claude is ready.\n");
        } else if (next === "install_other" && !hasCodex) {
          installProviderPackage(CODEX_PKG);
          hasCodex = checkCodex();
          installedCodexThisRun = true;
          console.log("\nComplete. Codex is ready.\n");
        }
        if (hasClaude && hasCodex) {
          console.log("Both providers are ready. Continuing with init.\n");
          break;
        }
      }
    }

    if (hasClaude && justInstalledClaude && process.stdin.isTTY) {
      console.log("\nClaude CLI was just installed. You'll be switched to Claude to sign in or complete setup. Exit Claude when done.\n");
      spawnSync("claude", [], { stdio: "inherit", cwd: projectRoot, shell: true });
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
