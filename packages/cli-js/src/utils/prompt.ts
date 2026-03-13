/**
 * Load prompt content from a file path (LangChain-style load_prompt).
 * No fallback: file must exist; throws on read error or missing file.
 */

import { readFile } from "fs/promises";

/**
 * Load prompt text from a file. Returns trimmed content.
 * @param path - Absolute path to the prompt file (e.g. .md).
 * @throws If the file cannot be read or is missing.
 */
export async function loadPrompt(path: string): Promise<string> {
  const text = await readFile(path, "utf-8");
  return text.trim();
}
