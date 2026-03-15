/**
 * Copy @planforge/core content (prompts, models.json) into packages/cli-js/core so the published npm package contains them.
 * Run from packages/cli-js (e.g. node scripts/copy-core.js).
 */
import { cpSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..");
const corePkg = resolve(repoRoot, "packages", "core");
const dest = resolve(__dirname, "..", "core");
const promptsSrc = resolve(corePkg, "prompts");
const modelsSrc = resolve(corePkg, "models.json");

if (!existsSync(promptsSrc) || !existsSync(modelsSrc)) {
  console.error("copy-core: packages/core/prompts or models.json not found");
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
cpSync(promptsSrc, resolve(dest, "prompts"), { recursive: true });
cpSync(modelsSrc, resolve(dest, "models.json"));
console.log("copy-core: copied core to", dest);
