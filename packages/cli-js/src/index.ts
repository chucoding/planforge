#!/usr/bin/env node
/**
 * PlanForge CLI entry point.
 */

import { runInit } from "./commands/init.js";
import { runDoctor } from "./commands/doctor.js";
import { runInstall } from "./commands/install.js";

const [, , cmd, ...args] = process.argv;

async function main(): Promise<void> {
  switch (cmd) {
    case "init":
      await runInit(args);
      break;
    case "doctor":
      await runDoctor(args);
      break;
    case "install":
      await runInstall(args);
      break;
    default:
      console.log("Usage: planforge <init|doctor|install> [options]");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
