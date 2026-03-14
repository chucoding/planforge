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

function fail(message) {
  console.error(`[validate_cursor_assets] ERROR: ${message}`);
  process.exit(1);
}

function readText(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`missing required file: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function requireContains(filePath, text, required) {
  for (const needle of required) {
    if (!text.includes(needle)) {
      fail(`${filePath} is missing required text: ${JSON.stringify(needle)}`);
    }
  }
}

function parseFrontmatter(filePath, text) {
  if (!text.startsWith("---\n")) {
    fail(`${filePath} must start with YAML frontmatter`);
  }
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) {
    fail(`${filePath} has invalid frontmatter delimiter`);
  }
  return {
    frontmatter: text.slice(4, end),
    body: text.slice(end + 5),
  };
}

function ensureEqual(aPath, aText, bPath, bText) {
  if (aText !== bText) {
    fail(`template/runtime mismatch: ${aPath} != ${bPath}`);
  }
}

function validateSkill(filePath) {
  const text = readText(filePath);
  const { frontmatter, body } = parseFrontmatter(filePath, text);
  requireContains(filePath, frontmatter, ["name:", "description:"]);
  requireContains(filePath, body, [
    "must execute the PlanForge command path",
    "run_",
    "Do not",
    "If script execution is blocked or fails",
  ]);
  return text;
}

function validateWorkflow(filePath) {
  const text = readText(filePath);
  requireContains(filePath, text, [
    "planforge plan",
    "planforge implement",
    "Do not write any plan/design output directly",
    "Do not produce direct implementation output",
  ]);
  return text;
}

const templateP = validateSkill(TEMPLATE_P);
const templateI = validateSkill(TEMPLATE_I);
const templateWorkflow = validateWorkflow(TEMPLATE_WORKFLOW);

const runtimeP = validateSkill(RUNTIME_P);
const runtimeI = validateSkill(RUNTIME_I);
const runtimeWorkflow = validateWorkflow(RUNTIME_WORKFLOW);

ensureEqual(TEMPLATE_P, templateP, RUNTIME_P, runtimeP);
ensureEqual(TEMPLATE_I, templateI, RUNTIME_I, runtimeI);
ensureEqual(TEMPLATE_WORKFLOW, templateWorkflow, RUNTIME_WORKFLOW, runtimeWorkflow);

console.log("[validate_cursor_assets] OK");
