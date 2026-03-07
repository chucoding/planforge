/**
 * Copy PlanForge templates (skills, rules, config) into project
 */

import fs from "fs-extra";
import { resolve } from "path";
import { getTemplatesRoot } from "../utils/paths.js";

export interface InstallOptions {
  force?: boolean;
}

export async function installTemplates(
  projectRoot: string,
  options: InstallOptions = {}
): Promise<void> {
  const templatesRoot = getTemplatesRoot();
  const cursorDir = resolve(projectRoot, ".cursor");
  const cursorTemplates = resolve(templatesRoot, "cursor");

  await fs.ensureDir(cursorDir);

  const skillsSrc = resolve(cursorTemplates, "skills");
  const skillsDest = resolve(cursorDir, "skills");
  await fs.ensureDir(skillsDest);

  if (await fs.pathExists(resolve(skillsSrc, "p"))) {
    await fs.copy(resolve(skillsSrc, "p"), resolve(skillsDest, "p"), { overwrite: true });
  }
  if (await fs.pathExists(resolve(skillsSrc, "i"))) {
    await fs.copy(resolve(skillsSrc, "i"), resolve(skillsDest, "i"), { overwrite: true });
  }

  const rulesSrc = resolve(cursorTemplates, "rules");
  const rulesDest = resolve(cursorDir, "rules");
  if (await fs.pathExists(rulesSrc)) {
    await fs.ensureDir(rulesDest);
    await fs.copy(rulesSrc, rulesDest, { overwrite: true });
  }

  const configSrc = resolve(templatesRoot, "config", "planforge.json");
  const configDest = resolve(projectRoot, "planforge.json");
  if (await fs.pathExists(configSrc)) {
    if (options.force || !(await fs.pathExists(configDest))) {
      await fs.copy(configSrc, configDest, { overwrite: true });
    }
  }
}
