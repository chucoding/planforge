/**
 * planforge doctor - check environment and providers
 */

import * as readline from "readline";
import fs from "fs-extra";
import { resolve } from "path";
import { getProjectRoot, getPlansDir, getTemplatesRoot } from "../utils/paths.js";
import { loadConfig } from "../config/load.js";
import type { PlanForgeConfig } from "../config/types.js";
import { checkClaude, listModelsClaude, completeOneTurn as claudeCompleteOneTurn } from "../providers/claude.js";
import { checkCodex, listModelsCodex, completeOneTurn as codexCompleteOneTurn } from "../providers/codex.js";

type Status = "ok" | "warn" | "error";

interface Check {
  name: string;
  status: Status;
  message: string;
}

function statusSymbol(s: Status): string {
  switch (s) {
    case "ok":
      return "[OK]";
    case "warn":
      return "[WARN]";
    case "error":
      return "[ERROR]";
  }
}

export async function runDoctor(_args: string[]): Promise<void> {
  const cwd = process.cwd();
  const projectRoot = getProjectRoot(cwd);
  const plansDir = getPlansDir(projectRoot);
  const checks: Check[] = [];

  const configPath = resolve(projectRoot, "planforge.json");
  const hasConfigFile = await fs.pathExists(configPath);
  let config: PlanForgeConfig | null = null;
  let configLoadError: Error | null = null;
  if (hasConfigFile) {
    try {
      config = await loadConfig(projectRoot);
    } catch (e) {
      configLoadError = e instanceof Error ? e : new Error(String(e));
    }
  }

  const hasClaude = checkClaude();
  const hasCodex = checkCodex();

  checks.push({
    name: "Claude CLI",
    status: hasClaude ? "ok" : "warn",
    message: hasClaude ? "available" : "not found (planning /p will be limited)",
  });
  checks.push({
    name: "Codex CLI",
    status: hasCodex ? "ok" : "warn",
    message: hasCodex ? "available" : "not found (implementation /i will be limited)",
  });

  if (!hasConfigFile) {
    checks.push({
      name: "planforge.json",
      status: "error",
      message: "missing (run planforge init)",
    });
  } else if (configLoadError) {
    checks.push({
      name: "planforge.json",
      status: "error",
      message: `invalid or unreadable (${configLoadError.message})`,
    });
  } else {
    checks.push({
      name: "planforge.json",
      status: "ok",
      message: "exists",
    });
  }

  const hasPlansDir = await fs.pathExists(plansDir);
  checks.push({
    name: ".cursor/plans",
    status: hasPlansDir ? "ok" : "error",
    message: hasPlansDir ? "exists" : "missing (run planforge init)",
  });

  const contextDir = config?.contextDir ?? ".cursor/context";
  const contextDirPath = resolve(projectRoot, contextDir);
  const hasContextDir = await fs.pathExists(contextDirPath);
  checks.push({
    name: "contextDir",
    status: hasContextDir ? "ok" : "warn",
    message: hasContextDir ? `${contextDir} exists` : `${contextDir} missing (run planforge init)`,
  });

  console.log("\nPlanForge doctor");
  console.log("  ------------------------------");
  console.log("");
  const maxName = Math.max(...checks.map((c) => c.name.length), 16);
  for (const c of checks) {
    const sym = statusSymbol(c.status);
    const padded = c.name.padEnd(maxName);
    console.log(`  ${sym}  ${padded}  ${c.message}`);
  }
  console.log("");
  if (!hasClaude || !hasCodex) {
    console.log("  Run planforge init to install missing providers.");
  }
  if (hasClaude || hasCodex) {
    console.log("  Run planforge config suggest to see recommended config for your providers.");
  }
  console.log("");

  const hasError = checks.some((c) => c.status === "error");
  if (hasError) {
    process.exit(1);
  }
}

export interface DoctorAiModelOption {
  provider: string;
  model: string;
  recommended: boolean;
}

function loadWorkflowMdc(projectRoot: string): string {
  const installed = resolve(projectRoot, ".cursor", "rules", "workflow.mdc");
  if (fs.existsSync(installed)) {
    return fs.readFileSync(installed, "utf-8");
  }
  const templatesPath = resolve(getTemplatesRoot(), "cursor", "rules", "workflow.mdc");
  if (fs.existsSync(templatesPath)) {
    return fs.readFileSync(templatesPath, "utf-8");
  }
  throw new Error(
    `Missing or invalid template: ${templatesPath}. Run from repo root or ensure templates exist.`
  );
}

function buildModelListFromConfig(config: PlanForgeConfig, hasClaude: boolean, hasCodex: boolean): DoctorAiModelOption[] {
  const seen = new Set<string>();
  const options: DoctorAiModelOption[] = [];
  const recommendedKey = config.planner.provider + "|" + config.planner.model;
  for (const role of ["planner", "implementer"] as const) {
    const r = config[role];
    const key = r.provider + "|" + r.model;
    if (seen.has(key)) continue;
    seen.add(key);
    if (r.provider === "claude" && !hasClaude) continue;
    if (r.provider === "codex" && !hasCodex) continue;
    options.push({
      provider: r.provider,
      model: r.model,
      recommended: key === recommendedKey,
    });
  }
  return options;
}

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve((answer ?? "").trim());
    });
  });
}

export async function runDoctorAi(args: string[]): Promise<void> {
  const cwd = process.cwd();
  const projectRoot = getProjectRoot(cwd);
  const hasClaude = checkClaude();
  const hasCodex = checkCodex();

  let config: PlanForgeConfig;
  try {
    config = await loadConfig(projectRoot);
  } catch (e) {
    console.error("Failed to load planforge.json:", (e as Error).message);
    process.exit(1);
  }

  const claudeModels = await listModelsClaude();
  const codexModels = await listModelsCodex();
  let options: DoctorAiModelOption[];
  if (claudeModels !== null || codexModels !== null) {
    options = [];
    if (claudeModels !== null && hasClaude) {
      const recommendedKey = config.planner.provider + "|" + config.planner.model;
      for (const model of claudeModels) {
        options.push({
          provider: "claude",
          model,
          recommended: config.planner.provider === "claude" && config.planner.model === model,
        });
      }
    }
    if (codexModels !== null && hasCodex) {
      for (const model of codexModels) {
        options.push({
          provider: "codex",
          model,
          recommended: config.planner.provider === "codex" && config.planner.model === model,
        });
      }
    }
    if (options.length === 0) options = buildModelListFromConfig(config, hasClaude, hasCodex);
  } else {
    options = buildModelListFromConfig(config, hasClaude, hasCodex);
  }

  if (options.length === 0) {
    console.error("No AI provider available. Install Claude or Codex CLI and run planforge init.");
    process.exit(1);
  }

  const providerArg = args.includes("--provider") ? args[args.indexOf("--provider") + 1] : undefined;
  const modelArg = args.includes("--model") ? args[args.indexOf("--model") + 1] : undefined;
  let selected: DoctorAiModelOption;
  if (providerArg && modelArg) {
    const match = options.find((o) => o.provider === providerArg && o.model === modelArg);
    if (!match) {
      console.error(`No matching option for --provider ${providerArg} --model ${modelArg}`);
      process.exit(1);
    }
    selected = match;
  } else if (process.stdin.isTTY) {
    console.log("\nPlanForge doctor ai – select AI to run workflow tests\n");
    options.forEach((o, i) => {
      const rec = o.recommended ? "  (recommended)" : "";
      console.log(`  ${i + 1}. ${o.provider} (${o.model})${rec}`);
    });
    console.log("");
    const raw = await ask("? Select AI to run workflow tests [1-" + options.length + "]: ");
    const n = parseInt(raw, 10);
    if (Number.isNaN(n) || n < 1 || n > options.length) {
      console.error("Invalid choice.");
      process.exit(1);
    }
    selected = options[n - 1];
  } else {
    selected = options[0];
  }

  const workflowContent = loadWorkflowMdc(projectRoot);
  const systemPrompt =
    workflowContent +
    "\n\nAnswer in one sentence only: what command or action you will take for the user request. Do not run anything.";

  const completeOneTurn =
    selected.provider === "claude" ? claudeCompleteOneTurn : codexCompleteOneTurn;
  const opts = { cwd: projectRoot, model: selected.model };

  console.log("\nRunning workflow tests with " + selected.provider + " (" + selected.model + ")...\n");

  const promptsPath = resolve(getTemplatesRoot(), "doctor-ai", "prompts.json");
  if (!fs.existsSync(promptsPath)) {
    throw new Error(`Missing or invalid template: ${promptsPath}. Run from repo root or ensure templates exist.`);
  }
  const promptsData = (await fs.readJson(promptsPath)) as { tc1PlanRequest?: string; tc2ImplementRequest?: string };
  if (typeof promptsData?.tc1PlanRequest !== "string" || typeof promptsData?.tc2ImplementRequest !== "string") {
    throw new Error(`Missing or invalid template: ${promptsPath}. Run from repo root or ensure templates exist.`);
  }

  let tc1Pass = false;
  let tc2Pass = false;
  try {
    const tc1Response = await completeOneTurn(
      systemPrompt,
      promptsData.tc1PlanRequest,
      opts
    );
    tc1Pass =
      tc1Response.includes("planforge plan") ||
      tc1Response.includes("run_plan.sh");
  } catch (e) {
    console.error("TC1 (plan request) error:", (e as Error).message);
  }
  try {
    const tc2Response = await completeOneTurn(
      systemPrompt,
      promptsData.tc2ImplementRequest,
      opts
    );
    tc2Pass =
      tc2Response.includes("planforge implement") ||
      tc2Response.includes("run_implement.sh");
  } catch (e) {
    console.error("TC2 (implement request) error:", (e as Error).message);
  }

  console.log("  TC1 (plan request)     : " + (tc1Pass ? "[OK] pass" : "[FAIL]"));
  console.log("  TC2 (implement request): " + (tc2Pass ? "[OK] pass" : "[FAIL]"));
  console.log("");
  if (!tc1Pass || !tc2Pass) {
    process.exit(1);
  }
}
