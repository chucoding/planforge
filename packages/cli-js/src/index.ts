#!/usr/bin/env node
/**
 * PlanForge CLI entry point.
 */

import { Command } from "commander";
import { runInit } from "./commands/init.js";
import { runDoctor, runDoctorAi } from "./commands/doctor.js";
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
  .description("Detect providers, run claude /init when available, install Cursor slash commands, create .planforge/plans, .planforge/contexts, and planforge.json")
  .option("--skip-provider-install", "Skip interactive provider (Claude/Codex) install prompt")
  .action(async (opts: { skipProviderInstall?: boolean }) => {
    await runInit(opts.skipProviderInstall ? ["--skip-provider-install"] : []);
  });

const doctorCmd = program
  .command("doctor")
  .description("Check environment: Claude CLI, Codex CLI, provider instruction files, planforge.json, .planforge/plans, and .planforge/contexts");
doctorCmd.action(async () => {
  await runDoctor([]);
});
doctorCmd
  .command("ai")
  .description("Run workflow compliance tests with AI (select model, then run TC1/TC2)")
  .option("--provider <name>", "Use this provider (skip interactive selection)")
  .option("--model <name>", "Use this model (use with --provider)")
  .action(async (opts: { provider?: string; model?: string }) => {
    const args: string[] = [];
    if (opts.provider) args.push("--provider", opts.provider);
    if (opts.model) args.push("--model", opts.model);
    await runDoctorAi(args);
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
  .description("Generate a development plan and save to .planforge/plans (uses planner from planforge.json)")
  .argument("[goal...]", "Planning goal (e.g. design auth refresh token)")
  .option("--context-dir <path>", "Path to markdown context directory (default: .planforge/contexts)")
  .option("--context <text>", "Conversation context text to pass to the planner")
  .action(async (goalParts: string[], opts: { contextDir?: string; context?: string }) => {
    await runPlan(goalParts, opts);
  });

program
  .command("implement")
  .description("Run implementation (uses implementer from planforge.json)")
  .argument("[prompt...]", "Implementation prompt or task")
  .option("--context-dir <path>", "Path to markdown context directory (default: .planforge/contexts)")
  .option("--context <text>", "Conversation context text to pass to the implementer")
  .option("--plan-file <path>", "Path to plan file (default: index.json activePlan or latest dated .plan.md)")
  .option("--files <paths...>", "File paths to focus on (overrides plan's Files Likely to Change)")
  .action(async (promptParts: string[], opts: { contextDir?: string; context?: string; planFile?: string; files?: string[] }) => {
    await runImplement(promptParts, opts);
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
