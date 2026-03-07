/**
 * planforge init - detect providers, install slash commands, create .cursor/plans
 */

import fs from "fs-extra";
import { resolve } from "path";
import { getProjectRoot, getPlansDir, getTemplatesRoot } from "../utils/paths.js";
import { checkClaude } from "../providers/claude.js";
import { checkCodex } from "../providers/codex.js";
import { runCommand } from "../utils/shell.js";
import { installTemplates } from "../templates/install.js";

const DEFAULT_AGENTS_MD = `# AGENTS.md

Codex/OpenAI agent context for this project.
Customize this file to give the implementer (/i) relevant project context.
`;

export async function runInit(_args: string[]): Promise<void> {
  const cwd = process.cwd();
  const projectRoot = getProjectRoot(cwd);

  try {
    // 1–2. Provider checks (informational; we still run init)
    const hasClaude = checkClaude();
    const hasCodex = checkCodex();

    // 3. claude /init
    if (hasClaude) {
      try {
        runCommand("claude", ["/init"], projectRoot);
      } catch (err) {
        console.warn("Warning: claude /init failed:", (err as Error).message);
      }
    }

    // 4. AGENTS.md for Codex
    if (hasCodex) {
      const agentsPath = resolve(projectRoot, "AGENTS.md");
      if (!(await fs.pathExists(agentsPath))) {
        await fs.writeFile(agentsPath, DEFAULT_AGENTS_MD, "utf-8");
        console.log("Created AGENTS.md");
      }
    }

    // 5. Cursor slash commands (templates) – installTemplates in step 8
    await installTemplates(projectRoot);

    // 6. .cursor/plans
    const plansDir = getPlansDir(projectRoot);
    await fs.ensureDir(plansDir);
    console.log("Created .cursor/plans");

    // 7. planforge.json
    const configPath = resolve(projectRoot, "planforge.json");
    if (!(await fs.pathExists(configPath))) {
      const templatesRoot = getTemplatesRoot();
      const templateConfig = resolve(templatesRoot, "config", "planforge.json");
      if (await fs.pathExists(templateConfig)) {
        await fs.copy(templateConfig, configPath);
        console.log("Created planforge.json");
      } else {
        await fs.writeJson(configPath, {
          planner: { provider: "claude", model: "opus", effort: "high" },
          implementer: { provider: "codex", model: "codex" },
          plansDir: ".cursor/plans",
        }, { spaces: 2 });
        console.log("Created planforge.json");
      }
    }

    console.log("PlanForge init complete.");
  } catch (err) {
    console.error("PlanForge init failed:", (err as Error).message);
    process.exit(1);
  }
}
