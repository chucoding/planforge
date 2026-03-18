/**
 * planforge doctor - check environment and providers
 */

import fs from "fs-extra";
import readline from "readline";
import { createSpinner } from "../utils/spinner.js";
import { resolve } from "path";
import {
  getProjectRoot,
  getPlansDir,
  getContextDir,
  getTemplatesRoot,
} from "../utils/paths.js";
import { printCurrentAiConfig, selectFromList } from "../utils/tui.js";
import { loadConfig } from "../config/load.js";
import type { PlanForgeConfig } from "../config/types.js";
import { checkClaude } from "../providers/claude.js";
import { checkCodex } from "../providers/codex.js";
import { getOneTurnRunner } from "../providers/registry.js";
import { loadModelsCatalog, runModelTui, type ModelsCatalog } from "./model.js";

const URL_TEST_URL = "https://httpbin.org/get";
const URL_TEST_TIMEOUT_MS = 5_000;

async function runUrlFetchTc(): Promise<{ passed: boolean; error?: string }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), URL_TEST_TIMEOUT_MS);
  try {
    const res = await fetch(URL_TEST_URL, {
      signal: controller.signal,
      headers: { "User-Agent": "PlanForge-CLI/1.0" },
    });
    clearTimeout(t);
    if (!res.ok) {
      return { passed: false, error: `HTTP ${res.status}` };
    }
    const body = await res.text();
    return { passed: body.length > 0 };
  } catch (e) {
    clearTimeout(t);
    const err = e as Error;
    const message = err.name === "AbortError" ? "timeout" : err.message;
    return { passed: false, error: message };
  }
}

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

function isDateDirName(name: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(name);
}

function isDatedPlanFileName(name: string): boolean {
  return /^\d{4}-.+\.plan\.md$/.test(name);
}

const DOCTOR_MODE_STATIC = "static";
const DOCTOR_MODE_AI = "ai";

/** When doctor is run without subcommand: TTY shows mode selection (static/ai/Quit) first; non-TTY runs static. */
export async function runDoctorModeSelect(): Promise<void> {
  if (!process.stdin.isTTY) {
    await runDoctor([]);
    return;
  }
  const chosen = await selectFromList(
    [
      { label: "static – Check environment and providers", value: DOCTOR_MODE_STATIC },
      { label: "ai – Run workflow tests with AI", value: DOCTOR_MODE_AI },
    ],
    "Mode  [Up/Down]  Enter to confirm"
  );
  if (chosen === null) process.exit(0);
  if (chosen === DOCTOR_MODE_STATIC) {
    await runDoctor([]);
    return;
  }
  await runDoctorAi([]);
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

  const contextDirPath = getContextDir(projectRoot);
  const hasContextDir = await fs.pathExists(contextDirPath);
  checks.push({
    name: ".cursor/contexts",
    status: hasContextDir ? "ok" : "warn",
    message: hasContextDir ? "exists" : "missing (run planforge init)",
  });

  const rulesDir = resolve(projectRoot, ".cursor", "rules");
  const planforgeRuleFiles = ["planforge-workflow.mdc", "planforge-cursor-agent-terminal.mdc"];
  for (const ruleFile of planforgeRuleFiles) {
    const rulePath = resolve(rulesDir, ruleFile);
    const hasRule = await fs.pathExists(rulePath);
    checks.push({
      name: `.cursor/rules/${ruleFile}`,
      status: hasRule ? "ok" : "warn",
      message: hasRule ? "exists" : "missing (run planforge install)",
    });
  }

  if (hasPlansDir) {
    const entries = await fs.readdir(plansDir, { withFileTypes: true });
    const hasLegacyFlatPlans = entries.some((entry) => entry.isFile() && entry.name.endsWith(".plan.md"));
    if (hasLegacyFlatPlans) {
      checks.push({
        name: "plans layout",
        status: "warn",
        message: "flat plan files in plans root (use YYYY-MM-DD/HHMM-slug.plan.md)",
      });
    }

    const invalidPlanDirs = entries
      .filter((entry) => entry.isDirectory() && !isDateDirName(entry.name))
      .map((entry) => entry.name);
    if (invalidPlanDirs.length > 0) {
      checks.push({
        name: "plans layout",
        status: "warn",
        message: `unexpected plan subdirs: ${invalidPlanDirs.join(", ")}`,
      });
    }

    for (const entry of entries.filter((item) => item.isDirectory() && isDateDirName(item.name))) {
      const datedEntries = await fs.readdir(resolve(plansDir, entry.name), { withFileTypes: true });
      const invalidFiles = datedEntries
        .filter((item) => item.isFile() && item.name.endsWith(".plan.md") && !isDatedPlanFileName(item.name))
        .map((item) => item.name);
      if (invalidFiles.length > 0) {
        checks.push({
          name: `plans/${entry.name}`,
          status: "warn",
          message: `unexpected filenames: ${invalidFiles.join(", ")}`,
        });
      }
    }
  }

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
  process.exit(0);
}

export interface DoctorAiModelOption {
  provider: string;
  model: string;
  recommended: boolean;
}

interface DoctorTcResult {
  passed: boolean;
  response: string;
  error?: string;
}

async function runStreamingDoctorTc(
  label: string,
  systemPrompt: string,
  userMessage: string,
  expectedKeywords: string[],
  provider: string,
  model: string,
  cwd: string
): Promise<DoctorTcResult> {
  const runner = getOneTurnRunner(provider);
  if (!runner) {
    return { passed: false, response: "", error: `Unsupported provider: ${provider}` };
  }

  let response = "";
  let passShown = false;
  const dim = "\x1b[2m";
  const reset = "\x1b[0m";
  const passColor = "\x1b[92m";
  const failColor = "\x1b[31m";
  const spinner = createSpinner({ prefix: "    response: " });
  const render = (suffix = "") => {
    const normalized = response.replace(/\s+/g, " ").trim();
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(`    ${dim}response:${reset} ${normalized}${suffix}`);
  };

  process.stdout.write(`  ${"\x1b[36m"}${label}${reset}\n`);
  process.stdout.write(`    ${dim}response:${reset} `);

  try {
    spinner.start();
    const finalResponse = await runner.streamOneTurn(
      systemPrompt,
      userMessage,
      (chunk) => {
        if (response.length === 0 && chunk.length > 0) spinner.stop();
        response += chunk;
        if (!passShown && expectedKeywords.some((keyword) => response.includes(keyword))) {
          passShown = true;
          render(`  ${passColor}\u2713 PASS${reset}`);
          return;
        }
        if (!passShown) {
          render();
        }
      },
      { cwd, model }
    );
    spinner.stop();
    response = finalResponse;
    const passed = expectedKeywords.some((keyword) => response.includes(keyword));
    render(passed ? `  ${passColor}\u2713 PASS${reset}` : `  ${failColor}\u2717 FAIL${reset}`);
    process.stdout.write("\n");
    return { passed, response };
  } catch (err) {
    spinner.stop();
    render(`  ${failColor}\u2717 FAIL${reset}`);
    process.stdout.write("\n");
    return {
      passed: false,
      response,
      error: (err as Error).message,
    };
  }
}

function loadWorkflowMdc(projectRoot: string): string {
  const installed = resolve(projectRoot, ".cursor", "rules", "planforge-workflow.mdc");
  if (fs.existsSync(installed)) {
    return fs.readFileSync(installed, "utf-8");
  }
  const templatesPath = resolve(getTemplatesRoot(), "cursor", "rules", "planforge-workflow.mdc");
  if (fs.existsSync(templatesPath)) {
    return fs.readFileSync(templatesPath, "utf-8");
  }
  throw new Error(
    `Missing or invalid template: ${templatesPath}. Run from repo root or ensure templates exist.`
  );
}

/** Validate that provider+model exists in catalog (for --provider --model). */
function isValidProviderModel(catalog: ModelsCatalog, provider: string, model: string): boolean {
  const prov = catalog.providers[provider];
  return Boolean(prov?.models?.some((m) => m.id === model));
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

  let catalog: ModelsCatalog;
  try {
    catalog = loadModelsCatalog();
  } catch (e) {
    console.error((e as Error).message);
    console.error("doctor ai uses the same model catalog as planforge model. Run pnpm run build in cli-js or use planforge model.");
    process.exit(1);
  }

  const providerArg = args.includes("--provider") ? args[args.indexOf("--provider") + 1] : undefined;
  const modelArg = args.includes("--model") ? args[args.indexOf("--model") + 1] : undefined;
  const isInteractive = process.stdin.isTTY && !providerArg && !modelArg;

  const promptsPath = resolve(getTemplatesRoot(), "doctor", "prompts.json");
  if (!fs.existsSync(promptsPath)) {
    throw new Error(`Missing or invalid template: ${promptsPath}. Run from repo root or ensure templates exist.`);
  }
  const promptsData = (await fs.readJson(promptsPath)) as {
    tc1PlanRequest?: string;
    tc2ImplementRequest?: string;
    tc3SlashPWithImplementationStyleContent?: string;
  };
  if (
    typeof promptsData?.tc1PlanRequest !== "string" ||
    typeof promptsData?.tc2ImplementRequest !== "string" ||
    typeof promptsData?.tc3SlashPWithImplementationStyleContent !== "string"
  ) {
    throw new Error(`Missing or invalid template: ${promptsPath}. Run from repo root or ensure templates exist.`);
  }

  const systemPrompt = loadWorkflowMdc(projectRoot);
  let exitCode = 0;
  let selectedPlanner: DoctorAiModelOption;
  let selectedImplementer: DoctorAiModelOption;

  if (providerArg && modelArg) {
    if (!isValidProviderModel(catalog, providerArg, modelArg)) {
      console.error(`No matching option for --provider ${providerArg} --model ${modelArg}. Check models.json catalog.`);
      process.exit(1);
    }
    selectedPlanner = selectedImplementer = {
      provider: providerArg,
      model: modelArg,
      recommended: false,
    };
  } else if (isInteractive) {
    selectedPlanner = {
      provider: config.planner.provider,
      model: config.planner.model,
      recommended: false,
    };
    selectedImplementer = {
      provider: config.implementer.provider,
      model: config.implementer.model,
      recommended: false,
    };
    for (;;) {
      printCurrentAiConfig(
        {
          planner: {
            provider: selectedPlanner.provider,
            model: selectedPlanner.model,
            ...(config.planner.effort != null && { effort: config.planner.effort }),
          },
          implementer: {
            provider: selectedImplementer.provider,
            model: selectedImplementer.model,
            ...(config.implementer.reasoning != null && { reasoning: config.implementer.reasoning }),
          },
        },
        "Doctor AI config"
      );

      const action = await selectFromList(
        [
          { label: "Run immediately", value: "run" as const },
          { label: "Change models", value: "change" as const },
        ],
        "Action  [Up/Down]  Enter to confirm"
      );
      if (action === null) process.exit(exitCode);
      if (action === "run") break;

      const firstRole = await selectFromList(
        [
          { label: "planner", value: "planner" as const },
          { label: "implementer", value: "implementer" as const },
        ],
        "Role to change  [Up/Down]  Enter to confirm"
      );
      if (firstRole === null) process.exit(exitCode);
      const secondRole = firstRole === "planner" ? "implementer" : "planner";

      const firstResult = await runModelTui(catalog, hasClaude, hasCodex, config, {
        preselectedMode: firstRole,
      });
      if (firstResult === null) process.exit(exitCode);
      const secondResult = await runModelTui(catalog, hasClaude, hasCodex, config, {
        preselectedMode: secondRole,
      });
      if (secondResult === null) process.exit(exitCode);

      const plannerResult = firstRole === "planner" ? firstResult : secondResult;
      const implementerResult = firstRole === "implementer" ? firstResult : secondResult;
      selectedPlanner = {
        provider: plannerResult.config.provider,
        model: plannerResult.config.model,
        recommended: false,
      };
      selectedImplementer = {
        provider: implementerResult.config.provider,
        model: implementerResult.config.model,
        recommended: false,
      };
      config.planner = {
        ...config.planner,
        provider: plannerResult.config.provider,
        model: plannerResult.config.model,
        ...(plannerResult.config.effort != null && { effort: plannerResult.config.effort }),
        ...(plannerResult.config.reasoning != null && { reasoning: plannerResult.config.reasoning }),
      };
      config.implementer = {
        ...config.implementer,
        provider: implementerResult.config.provider,
        model: implementerResult.config.model,
        ...(implementerResult.config.effort != null && { effort: implementerResult.config.effort }),
        ...(implementerResult.config.reasoning != null && { reasoning: implementerResult.config.reasoning }),
      };
    }
  } else {
    selectedPlanner = {
      provider: config.planner.provider,
      model: config.planner.model,
      recommended: false,
    };
    selectedImplementer = {
      provider: config.implementer.provider,
      model: config.implementer.model,
      recommended: false,
    };
  }

  const plannerRunner = getOneTurnRunner(selectedPlanner.provider);
  const implementerRunner = getOneTurnRunner(selectedImplementer.provider);
  if (!plannerRunner || !implementerRunner) {
    throw new Error("Unsupported provider selected for doctor ai");
  }

  const cyan = "\x1b[36m";
  const dim = "\x1b[2m";
  const green = "\x1b[92m";
  const red = "\x1b[31m";
  const reset = "\x1b[0m";
  const check = "\u2713";
  const cross = "\u2717";
  console.log("");
  console.log(cyan + "  \u2500\u2500\u2500 Workflow tests \u2500\u2500\u2500" + reset);
  console.log(dim + "  planner: " + selectedPlanner.provider + " / " + selectedPlanner.model + "  \u00b7  implementer: " + selectedImplementer.provider + " / " + selectedImplementer.model + reset);
  console.log("");

  let tc1Pass = false;
  let tc2Pass = false;
  let tc3Pass = false;
  let tc4Pass = false;
  if (process.stdout.isTTY) {
    const tc1 = await runStreamingDoctorTc(
      "TC1 (plan request)",
      systemPrompt,
      promptsData.tc1PlanRequest,
      ["planforge plan", "run_plan.sh", "run_plan.ps1"],
      selectedPlanner.provider,
      selectedPlanner.model,
      projectRoot
    );
    tc1Pass = tc1.passed;
    if (tc1.error) {
      console.error("TC1 (plan request) error:", tc1.error);
    }

    const tc2 = await runStreamingDoctorTc(
      "TC2 (implement request)",
      systemPrompt,
      promptsData.tc2ImplementRequest,
      ["planforge implement", "run_implement.sh", "run_implement.ps1"],
      selectedImplementer.provider,
      selectedImplementer.model,
      projectRoot
    );
    tc2Pass = tc2.passed;
    if (tc2.error) {
      console.error("TC2 (implement request) error:", tc2.error);
    }

    const tc3 = await runStreamingDoctorTc(
      "TC3 (/p with implementation-style request)",
      systemPrompt,
      promptsData.tc3SlashPWithImplementationStyleContent,
      ["planforge plan", "run_plan.sh", "run_plan.ps1"],
      selectedPlanner.provider,
      selectedPlanner.model,
      projectRoot
    );
    tc3Pass = tc3.passed;
    if (tc3.error) {
      console.error("TC3 (/p with implementation-style request) error:", tc3.error);
    }

    process.stdout.write("  " + cyan + "TC4 (URL fetch)" + reset + "\n    ");
    const tc4 = await runUrlFetchTc();
    tc4Pass = tc4.passed;
    if (tc4.error) {
      console.error("TC4 (URL fetch) error:", tc4.error);
    }
    console.log(tc4Pass ? green + check + " PASS  " + reset + "GET " + URL_TEST_URL : red + cross + " FAIL  " + reset + "GET " + URL_TEST_URL);

    console.log(cyan + "  \u2500\u2500\u2500 Results \u2500\u2500\u2500" + reset);
    console.log("  " + (tc1Pass ? green + check + " PASS" + reset : red + cross + " FAIL" + reset) + "  TC1 (plan request)");
    console.log("  " + (tc2Pass ? green + check + " PASS" + reset : red + cross + " FAIL" + reset) + "  TC2 (implement request)");
    console.log("  " + (tc3Pass ? green + check + " PASS" + reset : red + cross + " FAIL" + reset) + "  TC3 (/p with implementation-style request)");
    console.log("  " + (tc4Pass ? green + check + " PASS" + reset : red + cross + " FAIL" + reset) + "  TC4 (URL fetch)");
    console.log("");
  } else {
    try {
      const tc1Response = await plannerRunner.completeOneTurn(
        systemPrompt,
        promptsData.tc1PlanRequest,
        { cwd: projectRoot, model: selectedPlanner.model }
      );
      tc1Pass =
        tc1Response.includes("planforge plan") ||
        tc1Response.includes("run_plan.sh") ||
        tc1Response.includes("run_plan.ps1");
    } catch (e) {
      console.error("TC1 (plan request) error:", (e as Error).message);
    }
    try {
      const tc2Response = await implementerRunner.completeOneTurn(
        systemPrompt,
        promptsData.tc2ImplementRequest,
        { cwd: projectRoot, model: selectedImplementer.model }
      );
      tc2Pass =
        tc2Response.includes("planforge implement") ||
        tc2Response.includes("run_implement.sh") ||
        tc2Response.includes("run_implement.ps1");
    } catch (e) {
      console.error("TC2 (implement request) error:", (e as Error).message);
    }
    try {
      const tc3Response = await plannerRunner.completeOneTurn(
        systemPrompt,
        promptsData.tc3SlashPWithImplementationStyleContent,
        { cwd: projectRoot, model: selectedPlanner.model }
      );
      tc3Pass =
        tc3Response.includes("planforge plan") ||
        tc3Response.includes("run_plan.sh") ||
        tc3Response.includes("run_plan.ps1");
    } catch (e) {
      console.error("TC3 (/p with implementation-style request) error:", (e as Error).message);
    }
    try {
      const tc4 = await runUrlFetchTc();
      tc4Pass = tc4.passed;
    } catch (e) {
      console.error("TC4 (URL fetch) error:", (e as Error).message);
    }

    const _cyan = "\x1b[36m";
    const _green = "\x1b[92m";
    const _red = "\x1b[31m";
    const _reset = "\x1b[0m";
    const _check = "\u2713";
    const _cross = "\u2717";
    console.log(_cyan + "  \u2500\u2500\u2500 Results \u2500\u2500\u2500" + _reset);
    console.log("  " + (tc1Pass ? _green + _check + " PASS" + _reset : _red + _cross + " FAIL" + _reset) + "  TC1 (plan request)");
    console.log("  " + (tc2Pass ? _green + _check + " PASS" + _reset : _red + _cross + " FAIL" + _reset) + "  TC2 (implement request)");
    console.log("  " + (tc3Pass ? _green + _check + " PASS" + _reset : _red + _cross + " FAIL" + _reset) + "  TC3 (/p with implementation-style request)");
    console.log("  " + (tc4Pass ? _green + _check + " PASS" + _reset : _red + _cross + " FAIL" + _reset) + "  TC4 (URL fetch)");
    console.log("");
  }

  if (!tc1Pass || !tc2Pass || !tc3Pass || !tc4Pass) {
    exitCode = 1;
  }
  process.exit(exitCode);
}
