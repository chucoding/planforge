/**
 * planforge implement <prompt> - run implementation via configured implementer provider
 */

import fs from "fs-extra";
import { resolve, dirname } from "path";
import { getProjectRoot } from "../utils/paths.js";
import { loadConfig } from "../config/load.js";
import { getImplementerRunner } from "../providers/registry.js";

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

export async function runImplement(args: string[]): Promise<void> {
  const prompt = args.join(" ").trim();
  if (!prompt) {
    console.error("Usage: planforge implement <prompt>");
    process.exit(1);
  }

  const cwd = process.cwd();
  const projectRoot = getProjectRoot(cwd);

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

  try {
    const result = await runner.runImplement(prompt, { cwd: projectRoot });
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
