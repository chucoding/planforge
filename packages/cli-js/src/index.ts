#!/usr/bin/env node
/**
 * PlanForge CLI entry point.
 */

import { Command } from "commander";
import { runInit } from "./commands/init.js";
import { runDoctor } from "./commands/doctor.js";
import { runInstall } from "./commands/install.js";
import { runPlan } from "./commands/plan.js";

const program = new Command();

program
  .name("planforge")
  .description("Bring your own AI to Cursor. Use Claude or Codex inside Cursor Free.")
  .version("0.1.0");

program
  .command("init")
  .description("Detect providers, run claude /init, create AGENTS.md, install Cursor slash commands, create .cursor/plans and planforge.json")
  .option("--skip-provider-install", "Skip interactive provider (Claude/Codex) install prompt")
  .action(async (opts: { skipProviderInstall?: boolean }) => {
    await runInit(opts.skipProviderInstall ? ["--skip-provider-install"] : []);
  });

program
  .command("doctor")
  .description("Check environment: Claude CLI, Codex CLI, CLAUDE.md, AGENTS.md, planforge.json, .cursor/plans")
  .action(async () => {
    await runDoctor([]);
  });

program
  .command("install")
  .description("Install Cursor slash commands and templates to .cursor/skills and .cursor/rules")
  .option("-f, --force", "Overwrite existing planforge.json")
  .action(async (opts: { force?: boolean }) => {
    await runInstall(opts.force ? ["--force"] : []);
  });

program
  .command("plan")
  .description("Generate a development plan with Claude and save to .cursor/plans")
  .argument("[goal...]", "Planning goal (e.g. design auth refresh token)")
  .action(async (goalParts: string[]) => {
    await runPlan(goalParts);
  });

program.parse();
