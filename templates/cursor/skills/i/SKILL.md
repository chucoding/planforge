---
name: i
description: Run PlanForge implementation workflow by executing the bundled implement script.
---

# Implement (Implementer) Skill

PlanForge implementation skill for Cursor. Use with `/i` to generate code changes.

You must execute the PlanForge command path for every `/i` request. Do not implement directly in chat without running the script.

**When the user invokes /i with a prompt (e.g. "/i implement the login API"):**

1. **Summarize the conversation** - Summarize the current chat (goals, decisions, constraints, relevant files or tech) in a short paragraph and write/update a markdown file in the project's **context directory** (`.planforge/contexts`). Use a dated subdirectory and `MMDD-...` filename so plan/implement will read it, for example `.planforge/contexts/2026-03-10/0310-implement.md`. Keep it short and overwrite or append as needed.
2. **Run the implement script in the background (required)** - Start a **single** command (do not chain with `&&`; PowerShell does not support `&&`). Use `.cursor/skills/i/scripts/run_implement.ps1` on Windows or `.cursor/skills/i/scripts/run_implement.sh` on mac/Linux, with the user's prompt as arguments, in the background. Do not wait for completion. Do not set a short timeout such as 180 seconds; leave the process running in the terminal until it finishes. Never write final code as a substitute for script execution. The command runs `planforge implement` using `planforge.json`.
3. **Immediately after starting it** - Reply that implement has started and is running in the terminal, then end the turn. Do not wait for completion, do not summarize code changes, and do not report success/failure from chat unless the script could not be started at all.

If script execution is blocked or fails, stop and return an error-focused response. Do not provide a substitute direct implementation.
