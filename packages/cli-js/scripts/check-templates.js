/**
 * Verify required template files exist before build. Exit 1 if any are missing.
 */
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// scripts/ is packages/cli-js/scripts, so repo root is three levels up
const repoRoot = resolve(__dirname, "..", "..", "..");
const templatesDir = resolve(repoRoot, "templates");

const required = [
  "config/default-both.json",
  "config/default-claude-only.json",
  "config/default-codex-only.json",
  "doctor/prompts.json",
  "cursor/rules/planforge-workflow.mdc",
  "cursor/rules/planforge-cursor-agent-terminal.mdc",
];

const missing = required.filter((rel) => !existsSync(resolve(templatesDir, rel)));
if (missing.length > 0) {
  console.error("Missing required template files:");
  missing.forEach((rel) => console.error("  " + resolve(templatesDir, rel)));
  process.exit(1);
}
