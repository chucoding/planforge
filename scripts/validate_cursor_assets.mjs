#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const TEMPLATE_P = path.join(root, "templates", "cursor", "skills", "p", "SKILL.md");
const TEMPLATE_I = path.join(root, "templates", "cursor", "skills", "i", "SKILL.md");
const TEMPLATE_WORKFLOW = path.join(root, "templates", "cursor", "rules", "planforge-workflow.mdc");

const RUNTIME_P = path.join(root, ".cursor", "skills", "p", "SKILL.md");
const RUNTIME_I = path.join(root, ".cursor", "skills", "i", "SKILL.md");
const RUNTIME_WORKFLOW = path.join(root, ".cursor", "rules", "planforge-workflow.mdc");

const REQUIRED_FILES = [
  TEMPLATE_P,
  TEMPLATE_I,
  TEMPLATE_WORKFLOW,
  RUNTIME_P,
  RUNTIME_I,
  RUNTIME_WORKFLOW,
];

for (const filePath of REQUIRED_FILES) {
  if (!fs.existsSync(filePath)) {
    console.error(`[validate_cursor_assets] ERROR: missing required file: ${filePath}`);
    process.exit(1);
  }
}

console.log("[validate_cursor_assets] OK");
