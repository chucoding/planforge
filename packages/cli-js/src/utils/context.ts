import { relative, resolve } from "path";
import fs from "fs-extra";
import { getDefaultContextDirs } from "./paths.js";

async function resolveContextBases(cwd: string, contextDir?: string): Promise<string[]> {
  if (contextDir) {
    const base = resolve(cwd, contextDir);
    if (!(await fs.pathExists(base))) return [];
    const stat = await fs.stat(base);
    if (!stat.isDirectory()) {
      throw new Error(`Context path is not a directory: ${contextDir}`);
    }
    return [base];
  }

  const bases: string[] = [];
  for (const candidate of getDefaultContextDirs(cwd)) {
    if (!(await fs.pathExists(candidate))) continue;
    const stat = await fs.stat(candidate);
    if (!stat.isDirectory()) continue;
    bases.push(candidate);
  }
  return bases;
}

export async function loadContextDir(cwd: string, contextDir?: string): Promise<string | undefined> {
  const root = resolve(cwd);
  const bases = await resolveContextBases(root, contextDir);
  if (bases.length === 0) return undefined;

  const mdPaths: string[] = [];
  for (const base of bases) {
    const stack = [base];
    while (stack.length > 0) {
      const dir = stack.pop() as string;
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const next = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          stack.push(next);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
          mdPaths.push(next);
        }
      }
    }
  }

  const withMtime: { path: string; mtime: number }[] = [];
  for (const path of mdPaths) {
    const fileStat = await fs.stat(path);
    withMtime.push({ path, mtime: fileStat.mtimeMs });
  }
  withMtime.sort((a, b) => b.mtime - a.mtime || a.path.localeCompare(b.path));

  const blocks: string[] = [];
  for (const item of withMtime) {
    const content = (await fs.readFile(item.path, "utf-8")).trim();
    if (!content) continue;
    blocks.push(`### ${relative(root, item.path).replace(/\\/g, "/")}\n\n${content}`);
  }
  if (blocks.length === 0) return undefined;
  return blocks.join("\n\n");
}

export interface MergeContextOpts {
  contextDir?: string;
  inlineContext?: string;
}

export async function loadMergedContext(cwd: string, opts: MergeContextOpts): Promise<string | undefined> {
  const parts: string[] = [];
  const dirContent = await loadContextDir(cwd, opts.contextDir);
  if (dirContent) parts.push(dirContent);

  if (opts.inlineContext?.trim()) parts.push(opts.inlineContext.trim());
  if (parts.length === 0) return undefined;
  return parts.join("\n\n");
}
