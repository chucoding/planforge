import { resolve } from "path";
import fs from "fs-extra";

export async function loadContextDir(cwd: string, contextDir?: string): Promise<string | undefined> {
  if (!contextDir) return undefined;
  const base = resolve(cwd, contextDir);
  if (!(await fs.pathExists(base))) return undefined;
  const stat = await fs.stat(base);
  if (!stat.isDirectory()) {
    throw new Error(`Context path is not a directory: ${contextDir}`);
  }

  const mdPaths: string[] = [];
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
    const relative = item.path.slice(base.length + 1).replace(/\\/g, "/");
    blocks.push(`### ${relative}\n\n${content}`);
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
