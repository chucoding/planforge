/**
 * Claude provider - planning (e.g. /p)
 */

export async function checkClaude(): Promise<boolean> {
  // TODO: check if claude CLI or API is available
  return false;
}

export async function runPlan(prompt: string, _opts?: Record<string, unknown>): Promise<string> {
  // TODO: call Claude for plan generation
  return prompt;
}
