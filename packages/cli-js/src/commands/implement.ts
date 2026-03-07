/**
 * planforge implement <prompt> - run implementation via configured implementer provider
 */

import { getProjectRoot } from "../utils/paths.js";
import { loadConfig } from "../config/load.js";
import { getImplementerRunner } from "../providers/registry.js";

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
    console.log(result);
  } catch (err) {
    console.error("Implement failed:", (err as Error).message);
    process.exit(1);
  }
}
