/**
 * Load doctor AI test prompts from templates/doctor-ai/prompts.json (shared with cli-py).
 */

import fs from "fs-extra";
import { resolve } from "path";
import { getTemplatesRoot } from "../utils/paths.js";

const DEFAULT_PROMPTS = {
  tc1PlanRequest: "Give me a plan for this project.",
  tc2ImplementRequest: "Implement according to the plan.",
};

export interface DoctorAiPrompts {
  tc1PlanRequest: string;
  tc2ImplementRequest: string;
}

export async function getDoctorAiPrompts(): Promise<DoctorAiPrompts> {
  const path = resolve(getTemplatesRoot(), "doctor-ai", "prompts.json");
  try {
    if (await fs.pathExists(path)) {
      const data = (await fs.readJson(path)) as Partial<DoctorAiPrompts>;
      return {
        tc1PlanRequest: data.tc1PlanRequest ?? DEFAULT_PROMPTS.tc1PlanRequest,
        tc2ImplementRequest: data.tc2ImplementRequest ?? DEFAULT_PROMPTS.tc2ImplementRequest,
      };
    }
  } catch {
    /* use defaults */
  }
  return { ...DEFAULT_PROMPTS };
}
