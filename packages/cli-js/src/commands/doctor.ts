/**
 * planforge doctor - check environment and providers
 */

import fs from "fs-extra";
import readline from "readline";
import { resolve } from "path";
import {
  getProjectRoot,
  getPlansDir,
  getContextDir,
  getTemplatesRoot,
} from "../utils/paths.js";
import { printCurrentAiConfig, selectFromList } from "../utils/tui.js";
import { loadConfig, getDefaultDoctorAiConfig } from "../config/load.js";
import type { PlanForgeConfig } from "../config/types.js";
import { checkClaude, listModelsClaude } from "../providers/claude.js";
import { checkCodex, listModelsCodex } from "../providers/codex.js";
import { getOneTurnRunner } from "../providers/registry.js";
import { fetchUrlContent } from "../utils/url-fetch.js";
import { loadModelsCatalog, type ModelsCatalog } from "./model.js";

const URL_TEST_URL = "https://example.com";
const URL_TEST_TIMEOUT_MS = 5_000;

async function runUrlFetchTc(): Promise<{ passed: boolean; error?: string }> {
  try {
    const body = await fetchUrlContent(URL_TEST_URL, URL_TEST_TIMEOUT_MS);
    return { passed: body.length > 0 };
  } catch (e) {
    return { passed: false, error: (e as Error).message };
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

/** When doctor is run without subcommand: TTY shows Doctor AI config (default) then mode selection (static/ai/Quit); non-TTY runs static. */
export async function runDoctorModeSelect(): Promise<void> {
  if (!process.stdin.isTTY) {
    await runDoctor([]);
    return;
  }
  const hasClaude = checkClaude();
  const hasCodex = checkCodex();
  try {
    const doctorAiConfig = getDefaultDoctorAiConfig(hasClaude, hasCodex);
    printCurrentAiConfig(doctorAiConfig, "Doctor AI config (default)");
  } catch {
    // skip config block if templates missing
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
  const spinnerFrames = ["|", "/", "-", "\\"];
  let spinnerInterval: ReturnType<typeof setInterval> | null = null;
  const startSpinner = () => {
    let frameIdx = 0;
    spinnerInterval = setInterval(() => {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(`    ${dim}response:${reset} ${spinnerFrames[frameIdx % spinnerFrames.length]}`);
      frameIdx++;
    }, 80);
  };
  const stopSpinner = () => {
    if (spinnerInterval !== null) {
      clearInterval(spinnerInterval);
      spinnerInterval = null;
    }
  };
  const render = (suffix = "") => {
    const normalized = response.replace(/\s+/g, " ").trim();
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(`    ${dim}response:${reset} ${normalized}${suffix}`);
  };

  process.stdout.write(`  ${"\x1b[36m"}${label}${reset}\n`);
  process.stdout.write(`    ${dim}response:${reset} `);

  try {
    startSpinner();
    const finalResponse = await runner.streamOneTurn(
      systemPrompt,
      userMessage,
      (chunk) => {
        if (response.length === 0 && chunk.length > 0) stopSpinner();
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
    stopSpinner();
    response = finalResponse;
    const passed = expectedKeywords.some((keyword) => response.includes(keyword));
    render(passed ? `  ${passColor}\u2713 PASS${reset}` : `  ${failColor}\u2717 FAIL${reset}`);
    process.stdout.write("\n");
    return { passed, response };
  } catch (err) {
    stopSpinner();
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

/** Build flat provider/model options from models.json catalog for available providers only. */
function buildOptionsFromCatalog(catalog: ModelsCatalog, hasClaude: boolean, hasCodex: boolean): DoctorAiModelOption[] {
  const options: DoctorAiModelOption[] = [];
  const seen = new Set<string>();
  for (const providerId of Object.keys(catalog.providers)) {
    if (providerId === "claude" && !hasClaude) continue;
    if (providerId === "codex" && !hasCodex) continue;
    const prov = catalog.providers[providerId];
    const models = prov?.models ?? [];
    for (const m of models) {
      const key = providerId + "|" + m.id;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({ provider: providerId, model: m.id, recommended: false });
    }
  }
  return options;
}

/**
 * Interactive: select provider then model (last model = recommended). Returns { provider, model } or null if canceled.
 */
async function selectProviderAndModel(
  catalog: ModelsCatalog,
  hasClaude: boolean,
  hasCodex: boolean,
  roleLabel: string
): Promise<{ provider: string; model: string } | null> {
  const providerIds = Object.keys(catalog.providers).filter(
    (p) => (p === "claude" && hasClaude) || (p === "codex" && hasCodex)
  );
  if (providerIds.length === 0) return null;

  for (;;) {
    const providerId = await selectFromList(
      providerIds.map((id) => ({
        label: `${catalog.providers[id]?.name ?? id} (${id})`,
        value: id,
      })),
      `Select ${roleLabel}  [Up/Down]  Enter to confirm`
    );
    if (providerId === null) return null;

    const prov = catalog.providers[providerId];
    const models = prov?.models ?? [];
    if (models.length === 0) continue;

    const modelId = await selectFromList(
      models.map((model, index) => ({
        label: `${model.label} (${model.id})${index === models.length - 1 ? "  (recommended)" : ""}`,
        value: model.id,
      })),
      "[Up/Down] model  Enter to confirm  (last = recommended)"
    );
    if (modelId === null) continue;
    return { provider: providerId, model: modelId };
  }
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

  let catalog: ModelsCatalog | null = null;
  try {
    catalog = loadModelsCatalog();
  } catch {
    catalog = null;
  }

  let options: DoctorAiModelOption[];
  if (catalog !== null) {
    options = buildOptionsFromCatalog(catalog, hasClaude, hasCodex);
  } else {
    const claudeModels = await listModelsClaude();
    const codexModels = await listModelsCodex();
    if (claudeModels !== null || codexModels !== null) {
      options = [];
      if (claudeModels !== null && hasClaude) {
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
  }

  if (options.length === 0) {
    console.error("No AI provider available. Install Claude or Codex CLI and run planforge init.");
    process.exit(1);
  }

  const providerArg = args.includes("--provider") ? args[args.indexOf("--provider") + 1] : undefined;
  const modelArg = args.includes("--model") ? args[args.indexOf("--model") + 1] : undefined;
  const isInteractive = process.stdin.isTTY && !providerArg && !modelArg;
  const usePlannerImplementerSelection = isInteractive && catalog !== null;

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

  const workflowContent = loadWorkflowMdc(projectRoot);
  const systemPrompt =
    workflowContent +
    "\n\nAnswer in one sentence only: what command or action you will take for the user request. Do not run anything.";

  let exitCode = 0;
  let selectedPlanner: DoctorAiModelOption;
  let selectedImplementer: DoctorAiModelOption;

  if (providerArg && modelArg) {
    const match = options.find((o) => o.provider === providerArg && o.model === modelArg);
    if (!match) {
      console.error(`No matching option for --provider ${providerArg} --model ${modelArg}`);
      process.exit(1);
    }
    selectedPlanner = selectedImplementer = match;
  } else if (isInteractive) {
    const doctorAiDefault = getDefaultDoctorAiConfig(hasClaude, hasCodex);
    selectedPlanner = {
      provider: doctorAiDefault.planner.provider,
      model: doctorAiDefault.planner.model,
      recommended: false,
    };
    selectedImplementer = {
      provider: doctorAiDefault.implementer.provider,
      model: doctorAiDefault.implementer.model,
      recommended: false,
    };
    for (;;) {
      printCurrentAiConfig(
        {
          planner: {
            provider: selectedPlanner.provider,
            model: selectedPlanner.model,
            ...(doctorAiDefault.planner.effort != null && { effort: doctorAiDefault.planner.effort }),
          },
          implementer: {
            provider: selectedImplementer.provider,
            model: selectedImplementer.model,
            ...(doctorAiDefault.implementer.reasoning != null && { reasoning: doctorAiDefault.implementer.reasoning }),
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

      if (usePlannerImplementerSelection) {
        const firstRole = await selectFromList(
          [
            { label: "planner", value: "planner" as const },
            { label: "implementer", value: "implementer" as const },
          ],
          "Mode  [Up/Down]  Enter to confirm"
        );
        if (firstRole === null) process.exit(exitCode);
        const secondRole = firstRole === "planner" ? "implementer" : "planner";

        const firstSel = await selectProviderAndModel(catalog!, hasClaude, hasCodex, firstRole);
        if (firstSel === null) process.exit(exitCode);
        const secondSel = await selectProviderAndModel(catalog!, hasClaude, hasCodex, secondRole);
        if (secondSel === null) process.exit(exitCode);

        selectedPlanner =
          firstRole === "planner"
            ? { provider: firstSel.provider, model: firstSel.model, recommended: false }
            : { provider: secondSel.provider, model: secondSel.model, recommended: false };
        selectedImplementer =
          firstRole === "implementer"
            ? { provider: firstSel.provider, model: firstSel.model, recommended: false }
            : { provider: secondSel.provider, model: secondSel.model, recommended: false };
      } else {
        const selected = await selectFromList(
          options.map((option) => ({
            label: `${option.provider} (${option.model})`,
            value: option,
          })),
          "Select AI for workflow test  [Up/Down]  Enter to confirm"
        );
        if (selected === null) process.exit(exitCode);
        selectedPlanner = selectedImplementer = selected;
      }
    }
  } else {
    selectedPlanner = selectedImplementer = options[0];
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
