/**
 * File system utilities
 */

import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname } from "path";

export async function ensureDir(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

export async function readText(path: string): Promise<string> {
  return readFile(path, "utf-8");
}

export async function writeText(path: string, content: string): Promise<void> {
  await ensureDir(path);
  await writeFile(path, content, "utf-8");
}
