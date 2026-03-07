/**
 * planforge implement <prompt> - run implementation via configured implementer provider
 */

import fs from "fs-extra";
import { resolve, dirname } from "path";
import { readFile } from "fs/promises";
import { getProjectRoot } from "../utils/paths.js";
import { getActivePlanPath } from "../utils/active-plan.js";
import { parseFilesFromPlan } from "../utils/plan-files.js";
import { getProjectContext } from "../utils/project-context.js";
import { loadConfig } from "../config/load.js";
import { getImplementerRunner } from "../providers/registry.js";

const MAX_CODE_CONTEXT_CHARS = 12000;

/** Extract (relative path, content) from implement output: lines like "### 1) `path/to/file`" followed by a fenced code block. */
function extractFilesFromOutput(text: string): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [];
  // Match: optional "### N) " then `path` then optional whitespace/newlines then ```lang? newline content ```
  const blockRe = /(?:###\s*\d+\)\s*)?`([^`]+)`\s*[\r\n]+\s*```[\w]*\r?\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(text)) !== null) {
    const rawPath = m[1].trim().replace(/\\/g, "/").replace(/^\//, "");
    if (!rawPath || rawPath.includes("..")) continue;
    const content = m[2].replace(/\r\n/g, "\n").trimEnd();
    files.push({ path: rawPath, content });
  }
  return files;
}

export interface ImplementCliOpts {
  contextFile?: string;
  context?: string;
  planFile?: string;
  /** File paths to focus on (overrides plan's Files Likely to Change). */
  files?: string[];
}

async function resolveContext(opts: ImplementCliOpts | undefined, cwd: string): Promise<string | undefined> {
  if (!opts) return undefined;
  const parts: string[] = [];
  if (opts.contextFile) {
    const absPath = resolve(cwd, opts.contextFile);
    try {
      const content = await readFile(absPath, "utf-8");
      if (content.trim()) parts.push(content.trim());
    } catch (err) {
      console.error("Failed to read context file:", (err as Error).message);
      process.exit(1);
    }
  }
  if (opts.context?.trim()) parts.push(opts.context.trim());
  if (parts.length === 0) return undefined;
  return parts.join("\n\n");
}

/** True if path looks like a glob (contains * or **). */
function isGlob(path: string): boolean {
  return path.includes("*");
}

/** Build codeContext string from filesToChange (non-glob paths only), capped in total size. */
async function buildCodeContext(
  projectRoot: string,
  filesToChange: string[]
): Promise<string | undefined> {
  const root = resolve(projectRoot);
  const parts: string[] = [];
  let total = 0;
  for (const rel of filesToChange) {
    if (isGlob(rel) || total >= MAX_CODE_CONTEXT_CHARS) continue;
    const abs = resolve(root, rel);
    if (!abs.startsWith(root)) continue;
    try {
      const content = await readFile(abs, "utf-8");
      const block = `### \`${rel}\`\n\`\`\`\n${content}\n\`\`\`\n`;
      if (total + block.length > MAX_CODE_CONTEXT_CHARS) {
        const remaining = MAX_CODE_CONTEXT_CHARS - total - 50;
        if (remaining > 0) {
          parts.push(`### \`${rel}\`\n\`\`\`\n${content.slice(0, remaining)}\n...(truncated)\n\`\`\`\n`);
        }
        break;
      }
      parts.push(block);
      total += block.length;
    } catch {
      /* skip unreadable or binary */
    }
  }
  if (parts.length === 0) return undefined;
  return parts.join("\n");
}

export async function runImplement(args: string[], opts?: ImplementCliOpts): Promise<void> {
  const prompt = args.join(" ").trim();
  if (!prompt) {
    console.error("Usage: planforge implement <prompt>");
    process.exit(1);
  }

  const cwd = process.cwd();
  const projectRoot = getProjectRoot(cwd);
  const context = await resolveContext(opts, cwd);

  let planContent: string | undefined;
  if (opts?.planFile) {
    const absPlan = resolve(cwd, opts.planFile);
    try {
      planContent = await readFile(absPlan, "utf-8");
    } catch (err) {
      console.error("Failed to read plan file:", (err as Error).message);
      process.exit(1);
    }
  } else {
    const activePath = getActivePlanPath(projectRoot);
    if (activePath) {
      try {
        planContent = await readFile(activePath, "utf-8");
      } catch {
        /* skip plan if unreadable */
      }
    }
  }

  const config = await loadConfig(projectRoot);
  const runner = getImplementerRunner(config.implementer.provider);

  if (!runner) {
    console.error(`Unknown implementer provider: ${config.implementer.provider}. Check planforge.json.`);
    process.exit(1);
  }

  if (!runner.check()) {
    console.error(`${config.implementer.provider} CLI not found. Install the provider CLI to use planforge implement.`);
    process.exit(1);
  }

  const filesToChange = opts?.files?.length ? opts.files : parseFilesFromPlan(planContent);
  const codeContext =
    filesToChange.length > 0 ? await buildCodeContext(projectRoot, filesToChange) : undefined;
  const projectContext = getProjectContext(projectRoot);

  try {
    const result = await runner.runImplement(prompt, {
      cwd: projectRoot,
      context,
      planContent,
      filesToChange: filesToChange.length > 0 ? filesToChange : undefined,
      codeContext,
      projectContext,
    });
    const extracted = extractFilesFromOutput(result);
    const root = resolve(projectRoot);
    if (extracted.length > 0) {
      for (const { path: relPath, content } of extracted) {
        const absPath = resolve(root, relPath);
        if (!absPath.startsWith(root)) continue;
        await fs.ensureDir(dirname(absPath));
        await fs.writeFile(absPath, content, "utf-8");
        console.log("Written:", relPath);
      }
    }
    console.log(result);
  } catch (err) {
    console.error("Implement failed:", (err as Error).message);
    process.exit(1);
  }
}
