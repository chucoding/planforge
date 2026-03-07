/**
 * Codex provider - implementation (e.g. /i)
 */

export async function checkCodex(): Promise<boolean> {
  // TODO: check if Codex/OpenAI API is available
  return false;
}

export async function runImplement(prompt: string, _opts?: Record<string, unknown>): Promise<string> {
  // TODO: call Codex for implementation
  return prompt;
}
