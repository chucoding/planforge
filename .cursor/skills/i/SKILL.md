---
name: i
description: Run PlanForge implementation workflow by executing the bundled implement script.
---

# Implement (Implementer) Skill

PlanForge implementation skill for Cursor. Use with `/i` to generate code changes.

You must execute the PlanForge command path for every `/i` request. Do not implement directly in chat without running the script.

**When the user invokes /i with a prompt (e.g. "/i implement the login API"):**

1. **Summarize the conversation** - Summarize the current chat (goals, decisions, constraints, relevant files or tech) in a short paragraph and write/update a markdown file in the project's **context directory** (`.planforge/contexts`). Use a dated subdirectory and `MMDD-...` filename so plan/implement will read it, for example `.planforge/contexts/2026-03-10/0310-implement.md`. Keep it short and overwrite or append as needed.
2. **Run the implement script (required)** - Run **one** command only: no `cd`, no `&&`. Terminal is already in workspace root. Use `.cursor/skills/i/scripts/run_implement.ps1 "<prompt>"` on Windows or `.cursor/skills/i/scripts/run_implement.sh` on mac/Linux. Run it in the foreground so output streams in this terminal (sandbox). Wait for the command to complete. Never write final code as a substitute for script execution. The command runs `planforge implement` using `planforge.json`.
3. **After the command completes** - On success, summarize the result or suggest next steps and end the turn. On failure, report the error and suggested fixes only. If the script could not be started at all, return an error-focused response.

If script execution is blocked or fails, stop and return an error-focused response. Do not provide a substitute direct implementation.
