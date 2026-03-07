#!/usr/bin/env node
/**
 * PlanForge CLI entry point.
 */

import { Command } from "commander";
import { runInit } from "./commands/init.js";
import { runDoctor } from "./commands/doctor.js";
import { runInstall } from "./commands/install.js";
import { runPlan } from "./commands/plan.js";
import { runImplement } from "./commands/implement.js";
import { runConfigShow, runConfigSuggest } from "./commands/config.js";

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
  .description("Generate a development plan and save to .cursor/plans (uses planner from planforge.json)")
  .argument("[goal...]", "Planning goal (e.g. design auth refresh token)")
  .option("--context-file <path>", "Path to conversation context file (e.g. .cursor/chat-context.txt)")
  .option("--context <text>", "Conversation context text to pass to the planner")
  .action(async (goalParts: string[], cmd: { opts: () => { contextFile?: string; context?: string } }) => {
    await runPlan(goalParts, cmd.opts());
  });

program
  .command("implement")
  .description("Run implementation (uses implementer from planforge.json)")
  .argument("[prompt...]", "Implementation prompt or task")
  .option("--context-file <path>", "Path to conversation context file (e.g. .cursor/chat-context.txt)")
  .option("--context <text>", "Conversation context text to pass to the implementer")
  .action(async (promptParts: string[], cmd: { opts: () => { contextFile?: string; context?: string } }) => {
    await runImplement(promptParts, cmd.opts());
  });

const configCmd = program
  .command("config")
  .description("Show or suggest planforge.json config")
  .action(async () => {
    await runConfigShow([]);
  });
configCmd
  .command("show")
  .description("Show current planforge.json")
  .action(async () => {
    await runConfigShow([]);
  });
configCmd
  .command("suggest")
  .description("Suggest config for your installed providers (Current vs Suggested)")
  .option("--apply", "Write suggested config to planforge.json")
  .action(async (opts: { apply?: boolean }) => {
    await runConfigSuggest(opts.apply ? ["--apply"] : []);
  });

program.parse();
