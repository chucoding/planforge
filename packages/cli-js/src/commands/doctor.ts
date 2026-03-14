/**
 * planforge doctor - check environment and providers
 */

import fs from "fs-extra";
import { resolve } from "path";
import {
  getProjectRoot,
  getPlansDir,
  getContextDir,
  getLegacyContextDir,
  getTemplatesRoot,
} from "../utils/paths.js";
import { waitKey } from "../utils/tui.js";
import { loadConfig } from "../config/load.js";
import type { PlanForgeConfig } from "../config/types.js";
import { checkClaude, listModelsClaude, completeOneTurn as claudeCompleteOneTurn } from "../providers/claude.js";
import { checkCodex, listModelsCodex, completeOneTurn as codexCompleteOneTurn } from "../providers/codex.js";
import { loadModelsCatalog, type ModelsCatalog } from "./model.js";

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
    name: ".planforge/plans",
    status: hasPlansDir ? "ok" : "error",
    message: hasPlansDir ? "exists" : "missing (run planforge init)",
  });

  const contextDirPath = getContextDir(projectRoot);
  const hasContextDir = await fs.pathExists(contextDirPath);
  checks.push({
    name: ".planforge/contexts",
    status: hasContextDir ? "ok" : "warn",
    message: hasContextDir ? "exists" : "missing (run planforge init)",
  });

  // TODO: 06-13에 제거 (레거시 경로/플랫 플랜 경고 블록)
  const legacyContextDir = getLegacyContextDir(projectRoot);
  if (await fs.pathExists(legacyContextDir)) {
    checks.push({
      name: ".planforge/context",
      status: "warn",
      message: "legacy path detected (migrate to .planforge/contexts)",
    });
  }
  // TODO: 06-13에 제거 (위 레거시 블록과 함께)
  if (hasPlansDir) {
    const entries = await fs.readdir(plansDir, { withFileTypes: true });
    const hasLegacyFlatPlans = entries.some((entry) => entry.isFile() && entry.name.endsWith(".plan.md"));
    if (hasLegacyFlatPlans) {
      checks.push({
        name: "plans layout",
        status: "warn",
        message: "legacy flat plan files detected (use YYYY-MM-DD/MMDD-... .plan.md)",
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

function formatRoleLine(role: string, provider: string, model: string, extra?: string, recommended?: boolean): string {
  const rec = recommended ? "  (recommended)" : "";
  const ext = extra != null && extra !== "" ? ` (${extra})` : "";
  return `  ${role.padEnd(12)}: ${provider.padEnd(6)} / ${model.padEnd(20)}${ext}${rec}`;
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

  // recommended = current planforge.json planner (plan assumption)
  const plannerKey = config.planner.provider + "|" + config.planner.model;
  for (const o of options) {
    o.recommended = (o.provider + "|" + o.model) === plannerKey;
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
    console.log("\n  Current AI config");
    console.log("  -----------------");
    const pl = config.planner;
    const impl = config.implementer;
    const plExtra = pl.effort != null ? `effort: ${pl.effort}` : pl.reasoning != null ? `reasoning: ${pl.reasoning}` : undefined;
    const implExtra = impl.effort != null ? `effort: ${impl.effort}` : impl.reasoning != null ? `reasoning: ${impl.reasoning}` : undefined;
    console.log(formatRoleLine("planner", pl.provider, pl.model, plExtra, true));
    console.log(formatRoleLine("implementer", impl.provider, impl.model, implExtra, false));
    console.log("");
    console.log("  Select AI for workflow test  [Up/Down]  Enter to confirm\n");
    let index = 0;
    while (true) {
      for (let i = 0; i < options.length; i++) {
        const o = options[i];
        const rec = o.recommended ? "  (recommended)" : "";
        console.log((i === index ? "  > " : "    ") + `${o.provider} (${o.model})${rec}`);
      }
      const key = await waitKey();
      if (key === "quit") process.exit(0);
      if (key === "enter") break;
      if (key === "up") index = (index - 1 + options.length) % options.length;
      if (key === "down") index = (index + 1) % options.length;
      process.stdout.write(`\x1b[${options.length}A\x1b[0J`);
    }
    selected = options[index];
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

  let tc1Pass = false;
  let tc2Pass = false;
  let tc3Pass = false;
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
  try {
    const tc3Response = await completeOneTurn(
      systemPrompt,
      promptsData.tc3SlashPWithImplementationStyleContent,
      opts
    );
    tc3Pass =
      tc3Response.includes("planforge plan") ||
      tc3Response.includes("run_plan.sh");
  } catch (e) {
    console.error("TC3 (/p with implementation-style request) error:", (e as Error).message);
  }

  console.log("  TC1 (plan request)     : " + (tc1Pass ? "[OK] pass" : "[FAIL]"));
  console.log("  TC2 (implement request): " + (tc2Pass ? "[OK] pass" : "[FAIL]"));
  console.log("  TC3 (/p with implementation-style request): " + (tc3Pass ? "[OK] pass" : "[FAIL]"));
  console.log("");
  if (!tc1Pass || !tc2Pass || !tc3Pass) {
    process.exit(1);
  }
}
