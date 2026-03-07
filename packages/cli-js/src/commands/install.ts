/**
 * planforge install - install Cursor slash commands and templates
 */

import { getProjectRoot } from "../utils/paths.js";
import { installTemplates } from "../templates/install.js";

export async function runInstall(args: string[]): Promise<void> {
  const force = args.includes("--force");
  const cwd = process.cwd();
  const projectRoot = getProjectRoot(cwd);

  try {
    await installTemplates(projectRoot, { force });
    console.log("PlanForge templates installed to .cursor/skills and .cursor/rules.");
  } catch (err) {
    console.error("Install failed:", (err as Error).message);
    process.exit(1);
  }
}
