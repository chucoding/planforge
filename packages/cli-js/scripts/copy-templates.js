/**
 * Copy repo-root templates into packages/cli-js/templates so the published npm package contains them.
 * Run from packages/cli-js (e.g. node scripts/copy-templates.js).
 */
import { cpSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..");
const src = resolve(repoRoot, "templates");
const dest = resolve(__dirname, "..", "templates");

if (!existsSync(src)) {
  console.error("copy-templates: repo templates not found at", src);
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log("copy-templates: copied templates to", dest);
